const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const fetch = require("node-fetch");
const csv = require("csv-parser");
const dayjs = require("dayjs");

dotenv.config();

if (!process.env.OPENAI_API_KEY) {
  console.error("❌ Ошибка: OPENAI_API_KEY не задан в .env файле");
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const csvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRYscFQEwGmJMM4hxoWEBrYam3JkQMD9FKbKpcwMrgfSdhaducl_FeHNqwPe-Sfn0HSyeQeMnyqvgtN/pub?gid=0&single=true&output=csv";

// 🔎 Функция для поиска песни по дате и времени
async function findSongByDateTime(date, time) {
  const response = await fetch(csvUrl);
  return new Promise((resolve, reject) => {
    const results = [];
    response.body
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => {
        const song = results.find(row => {
          const rowDate = row["Дата выхода"]?.trim();
          const rowTime = row["Время выхода"]?.trim();
          return rowDate === date && rowTime === time;
        });
        resolve(song);
      })
      .on("error", reject);
  });
}

app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message?.trim();

    if (!userMessage) {
      return res.status(400).json({ error: "Сообщение не предоставлено" });
    }

    const songRequestMatch = userMessage.match(/(?:какая песня была|что за песня играла|что играло)\s*(в\s*(\d{1,2}:\d{2}))?(?:\s*(\d{1,2}\.\d{1,2}\.\d{2,4}))?/i);

    if (songRequestMatch) {
      const time = songRequestMatch[2] || dayjs().format("HH:mm");
      const date = songRequestMatch[3] || dayjs().format("DD.MM.YYYY");

      const song = await findSongByDateTime(date, time);
      if (song) {
        return res.json({
          reply: `🎶 В ${time} ${date} на RuWave играла песня: "${song["Название песни и исполнитель"]}"`
        });
      } else {
        return res.json({ reply: `❗ Не нашёл песню на ${time} ${date}` });
      }
    }

    const messages = [
      {
        role: "system",
        content: "Ты — виртуальный агент RuWave 94FM. Отвечай на вопросы о песнях и рекламе."
      },
      {
        role: "user",
        content: userMessage
      }
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages,
      max_tokens: 500,
      temperature: 0.7
    });

    const reply = completion?.choices?.[0]?.message?.content || "⚠️ Ошибка получения ответа от модели.";
    res.json({ reply });

  } catch (err) {
    console.error("❌ Ошибка:", err);
    res.status(500).json({ error: "Ошибка сервера", detail: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Сервер запущен на порту ${PORT}`));
