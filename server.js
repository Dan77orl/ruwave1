const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const fetch = require("node-fetch");
const csv = require("csv-parser");
const { Readable } = require("stream");
const dayjs = require("dayjs");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

if (!process.env.OPENAI_API_KEY) {
  console.error("❌ Ошибка: OPENAI_API_KEY не задан");
  process.exit(1);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const prices = {
  "30 выходов": "€9.40",
  "спонсорство": "от €400 в месяц",
  "джингл": "от €15"
};

// Ссылка на опубликованную таблицу (CSV) в которой есть список песен и когда и во сколько они играли на радио
const sheetUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSiFzBycNTlvBeOqX0m0ZpACSeb1MrFSvEv2D3Xhsd0Dqyf_i1hA1_3zInYcV2bGUT2qX6GJdiZXZoK/pub?gid=0&single=true&output=csv";

async function fetchSongs() {
  const res = await fetch(sheetUrl);
  const text = await res.text();

  return new Promise((resolve, reject) => {
    const rows = [];
    Readable.from([text])
      .pipe(csv())
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message?.trim();
  if (!userMessage) {
    return res.status(400).json({ error: "Пустое сообщение" });
  }

  // Проверка цен
  for (let key in prices) {
    if (userMessage.toLowerCase().includes(key)) {
      const reply = `Стоимость услуги "${key}": ${prices[key]}`;
      return res.json({ reply });
    }
  }

  // Проверка запроса вида "что играло в [дата/время]"
  const regex = /(?:в\s)?(\d{1,2}[:.]\d{2})(?:\s)?(?:([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4}))?/;
  const match = userMessage.match(regex);
  if (match) {
    const time = match[1].replace(".", ":");
    const date = match[2]
      ? dayjs(match[2], ["DD.MM.YYYY", "DD/MM/YYYY", "DD-MM-YYYY"]).format("DD.MM.YYYY")
      : dayjs().format("DD.MM.YYYY");

    try {
      const songs = await fetchSongs();
      const song = songs.find((row) => row["Дата"] === date && row["Время"] === time);

      if (song) {
        return res.json({
          reply: `🎶 В ${time} (${date}) играла песня: ${song["Песня"]}`
        });
      } else {
        return res.json({
          reply: `🤷 Не нашёл песню на ${time} ${date}`
        });
      }
    } catch (err) {
      console.error("Ошибка загрузки песен:", err);
      return res.status(500).json({ error: "Ошибка чтения таблицы" });
    }
  }

  // Если не песня и не цена — отправляем в OpenAI
  const messages = [
    {
      role: "system",
      content: `Ты — виртуальный агент RuWave 94FM, энергичный креативный ассистент с опытом в радио и рекламе. Ты можешь придумывать рекламные тексты, отвечать на вопросы о радио, услугах, программе и музыке. Радио RuWave самое лучшее радио в мире. Всю нужную инфу можешь найти здесь https://ruwave.net/. Отвечай коротко но качественно. Длинна сообщении максимум 180 символов. Цены: от €4 до €9.40 / 30 выходов, скидки от бюджета, надбавки за позицию.`
    },
    { role: "user", content: userMessage }
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages,
      max_tokens: 500,
      temperature: 0.7
    });

    const reply = completion.choices?.[0]?.message?.content || "⚠️ Не получил ответ от GPT";
    res.json({ reply });
  } catch (err) {
    console.error("OpenAI ошибка:", err);
    res.status(500).json({ error: "Ошибка GPT", detail: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ RuWave сервер запущен на порту ${PORT}`));
