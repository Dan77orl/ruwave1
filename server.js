const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const fetch = require("node-fetch");
const csv = require("csv-parser");
const stream = require("stream");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const weekday = require("dayjs/plugin/weekday");
const customParseFormat = require("dayjs/plugin/customParseFormat");
const isSameOrBefore = require("dayjs/plugin/isSameOrBefore");
const isSameOrAfter = require("dayjs/plugin/isSameOrAfter");

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(weekday);
dayjs.extend(customParseFormat);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

dotenv.config();

if (!process.env.OPENAI_API_KEY) {
  console.error("❌ Ошибка: OPENAI_API_KEY не задан в .env файле");
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const prices = {
  "30 выходов": "€9.40",
  "спонсорство": "от €400 в месяц",
  "джингл": "от €15"
};

async function getPlaylistData() {
  const url = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSiFzBycNTlvBeOqX0m0ZpACSeb1MrFSvEv2D3Xhsd0Dqyf_i1hA1_3zInYcV2bGUT2qX6GJdiZXZoK/pub?gid=0&single=true&output=csv";
  const response = await fetch(url);
  const data = await response.text();

  return new Promise((resolve, reject) => {
    const results = [];
    const readable = new stream.Readable();
    readable._read = () => {};
    readable.push(data);
    readable.push(null);

    readable
      .pipe(csv())
      .on("data", (row) => {
        results.push({
          title: row["Song"],
          date: row["Дата"],
          time: row["Время"],
          likes: row["Всего лайков"],
          dislikes: row["Всего дизлайков"]
        });
      })
      .on("end", () => resolve(results))
      .on("error", reject);
  });
}

async function findSongAtTime(userDateTime) {
  const data = await getPlaylistData();
  const target = dayjs(userDateTime, "DD.MM.YYYY HH:mm:ss");

  let closest = null;
  let minDiff = Infinity;

  for (let row of data) {
    const rowTime = dayjs(`${row.date} ${row.time}`, "DD.MM.YYYY HH:mm:ss");
    const diff = Math.abs(target.diff(rowTime));

    if (diff < minDiff) {
      minDiff = diff;
      closest = row;
    }
  }

  if (closest) {
    return `🎵 В ${closest.time} ${closest.date} на RuWave звучала “${closest.title}” — 👍 ${closest.likes || 0}, 👎 ${closest.dislikes || 0}`;
  } else {
    return "😕 Не удалось найти песню на это время.";
  }
}

function parseDateTimeFromMessage(message) {
  const now = dayjs().tz("Europe/Istanbul");
  const timeMatch = message.match(/(\d{1,2}):(\d{2})/);
  const hour = timeMatch ? parseInt(timeMatch[1]) : now.hour();
  const minute = timeMatch ? parseInt(timeMatch[2]) : now.minute();
  let date = null;

  if (message.includes("сейчас")) date = now;
  else if (message.includes("вчера")) date = now.subtract(1, "day");
  else if (message.includes("позавчера")) date = now.subtract(2, "day");
  else if (message.includes("сегодня")) date = now;
  else {
    const dateMatch = message.match(/(\d{1,2})\s?(июля|июня|мая|апреля|марта|февраля|января)/i);
    if (dateMatch) {
      const day = parseInt(dateMatch[1]);
      const monthMap = {
        января: 0, февраля: 1, марта: 2, апреля: 3, мая: 4, июня: 5,
        июля: 6, августа: 7, сентября: 8, октября: 9, ноября: 10, декабря: 11
      };
      const month = monthMap[dateMatch[2].toLowerCase()];
      const year = now.year();
      date = now.set("year", year).set("month", month).set("date", day);
    }
  }

  if (!date) return null;
  return date.set("hour", hour).set("minute", minute).set("second", 0).format("DD.MM.YYYY HH:mm:ss");
}

app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message?.trim();
    if (!userMessage) return res.status(400).json({ error: "Сообщение не предоставлено" });

    // Цены
    for (let key in prices) {
      if (userMessage.toLowerCase().includes(key)) {
        return res.json({ reply: `Стоимость услуги "${key}": ${prices[key]}` });
      }
    }

    // Поиск песни по времени
    const dateTime = parseDateTimeFromMessage(userMessage);
    if (dateTime) {
      const reply = await findSongAtTime(dateTime);
      return res.json({ reply });
    }

    // GPT-4 ответ
    const messages = [
      {
        role: "system",
        content: `Ты — виртуальный агент RuWave 94FM, русскоязычной радиостанции в Турции...`
      },
      { role: "user", content: userMessage }
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages,
      max_tokens: 500,
      temperature: 0.7
    });

    const reply = completion?.choices?.[0]?.message?.content || "⚠️ Ошибка получения ответа.";
    res.json({ reply });
  } catch (err) {
    console.error("❌ Ошибка в /chat:", err);
    res.status(500).json({ error: "Ошибка сервера", detail: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ RuWave сервер запущен на порту ${PORT}`));
