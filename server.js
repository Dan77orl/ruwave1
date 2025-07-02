const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fetch = require("node-fetch");
const OpenAI = require("openai");

dotenv.config();

if (!process.env.OPENAI_API_KEY) {
  console.error("❌ Ошибка: OPENAI_API_KEY не задан в .env файле");
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Переменная для хранения плейлиста
let playlist = [];

// Загрузка данных из Google Sheets
async function loadPlaylist() {
  try {
    const res = await fetch("https://docs.google.com/spreadsheets/d/e/2PACX-1vSiFzBycNTlvBeOqX0m0ZpACSeb1MrFSvEv2D3Xhsd0Dqyf_i1hA1_3zInYcV2bGUT2qX6GJdiZXZoK/pub?gid=0&single=true&output=csv");
    const text = await res.text();
    const rows = text.trim().split("\n").map(r => r.split(","));

    const headers = rows[0].map(h => h.trim().toLowerCase());
    const dateIdx = headers.findIndex(h => h.includes('date'));
    const timeIdx = headers.findIndex(h => h.includes('time'));
    const songIdx = headers.findIndex(h => h.includes('song'));

    playlist = rows.slice(1).map(row => ({
      date: row[dateIdx]?.trim(),
      time: row[timeIdx]?.trim(),
      song: row[songIdx]?.trim()
    })).filter(r => r.date && r.time && r.song);

    console.log(`✅ Плейлист обновлён: ${playlist.length} записей загружено`);
  } catch (err) {
    console.error("❌ Ошибка загрузки плейлиста:", err);
  }
}

// Загружаем плейлист при запуске и обновляем каждый час
loadPlaylist();
setInterval(loadPlaylist, 60 * 60 * 1000);

// 🔍 Функция поиска песен по дате и диапазону времени
function findSongsByDateTime(date, startTime, endTime) {
  const toMinutes = t => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };

  const start = toMinutes(startTime);
  const end = toMinutes(endTime);

  return playlist.filter(entry => {
    if (entry.date !== date) return false;
    const time = toMinutes(entry.time);
    return time >= start && time <= end;
  });
}

// 📡 Эндпоинт для чата с OpenAI + поиск песен
app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message?.trim();
    if (!userMessage) {
      return res.status(400).json({ error: "Сообщение не предоставлено" });
    }

    // Сначала GPT пытается понять, есть ли запрос о песнях
    const playlistCheck = /что играло|какая песня|что за песня|что было/i.test(userMessage);

    if (playlistCheck) {
      const today = new Date();
      const dateString = `${today.getDate().toString().padStart(2, '0')}.${(today.getMonth() + 1).toString().padStart(2, '0')}.${today.getFullYear()}`;

      // Пока простой вариант: ищем по сегодняшней дате и диапазону 00:00 - 23:59
      const results = findSongsByDateTime(dateString, "00:00", "23:59");

      if (results.length > 0) {
        const list = results.map(r => `${r.time} — ${r.song}`).join("\n");
        return res.json({ reply: `🎧 Сегодня (${dateString}) играли следующие песни:\n${list}` });
      } else {
        return res.json({ reply: `🎧 Сегодня (${dateString}) песни не найдены в плейлисте.` });
      }
    }

    // Если это не запрос про песни, используем OpenAI
    const messages = [
      {
        role: "system",
        content: `Ты — виртуальный агент RuWave 94FM, русскоязычного радио в Турции. Ты знаешь плейлист из Google Таблицы https://docs.google.com/spreadsheets/d/1GAp46OM1pEaUBtBkxgGkGQEg7BUh9NZnXcSFmBkK-HM/edit и можешь отвечать на вопросы, какая песня играла в определённое время.`
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
    console.error("❌ Ошибка в /chat:", err);
    res.status(500).json({ error: "Ошибка сервера", detail: err.message });
  }
});

// 🚀 Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ RuWave сервер запущен на порту ${PORT}`));
