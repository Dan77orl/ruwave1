const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const fetch = require("node-fetch");
const csv = require("csv-parser");
const { Readable } = require("stream");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const PLAYLIST_CSV_URL = "https://docs.google.com/spreadsheets/d/e/your_id/pub?output=csv";

let playlistData = [];

async function loadPlaylist() {
  const response = await fetch(PLAYLIST_CSV_URL);
  const csvText = await response.text();

  playlistData = [];

  await new Promise((resolve, reject) => {
    Readable.from([csvText])
      .pipe(csv())
      .on("data", (row) => playlistData.push(row))
      .on("end", resolve)
      .on("error", reject);
  });

  console.log(`✅ Плейлист загружен: ${playlistData.length} строк`);
}

// Функция поиска песни по времени
function findSongByTime(queryTime) {
  const match = playlistData.find((row) => {
    const time = row["Время выхода"]?.trim();
    return time === queryTime;
  });

  if (match) {
    const name = row["Название песни"] || row[Object.keys(row)[0]]; // если нет заголовков
    return `🎶 В ${queryTime} играла песня: "${name}"`;
  }

  return null;
}

app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message?.trim();

    if (!userMessage) {
      return res.status(400).json({ error: "Пустое сообщение" });
    }

    const timeMatch = userMessage.match(/\d{1,2}:\d{2}:\d{2}/);
    if (timeMatch) {
      const reply = findSongByTime(timeMatch[0]);
      if (reply) return res.json({ reply });
    }

    // Иначе OpenAI
    const messages = [
      {
        role: "system",
        content: `Ты — виртуальный агент RuWave...`
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

    const reply = completion?.choices?.[0]?.message?.content || "⚠️ Нет ответа от модели.";
    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ошибка сервера", detail: err.message });
  }
});

// Запуск + загрузка плейлиста
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  await loadPlaylist();
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
