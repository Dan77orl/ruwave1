const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const fetch = require("node-fetch");
const csv = require("csv-parser");
const { Readable } = require("stream");

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

// 🔹 Ссылка на CSV из Google Таблицы
const PLAYLIST_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSiFzBycNTlvBeOqX0m0ZpACSeb1MrFSvEv2D3Xhsd0Dqyf_i1hA1_3zInYcV2bGUT2qX6GJdiZXZoK/pub?gid=0&single=true&output=csv";

let playlistData = [];

// 🔹 Загрузка плейлиста при старте
async function loadPlaylist() {
  try {
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

    console.log(`✅ Плейлист загружен: ${playlistData.length} записей`);
  } catch (err) {
    console.error("❌ Ошибка загрузки таблицы:", err.message);
  }
}

// 🔎 Поиск песни по времени (точное совпадение)
function findSongByTime(queryTime) {
  const match = playlistData.find((row) => row["Время выхода"]?.trim() === queryTime);
  if (match) {
    const title = row["Название"] || row[Object.keys(row)[0]]; // поддержка без заголовков
    const likes = row["Всего лайков"] || "0";
    return `🎵 В ${queryTime} играла песня "${title}". Количество лайков: ${likes}`;
  }
  return null;
}

// 💬 Основной обработчик чата
app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message?.trim();
    if (!userMessage) {
      return res.status(400).json({ error: "Сообщение не предоставлено" });
    }

    // Проверка на совпадение с локальным прайс-листом
    const prices = {
      "30 выходов": "€9.40",
      "спонсорство": "от €400 в месяц",
      "джингл": "от €15"
    };

    for (let key in prices) {
      if (userMessage.toLowerCase().includes(key)) {
        const reply = `Стоимость услуги "${key}": ${prices[key]}`;
        console.log("✅ Ответ из прайс-листа:", reply);
        return res.json({ reply });
      }
    }

    // Поиск песни по времени
    const timeMatch = userMessage.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/); // ищем HH:mm или HH:mm:ss
    if (timeMatch) {
      const found = findSongByTime(timeMatch[0]);
      if (found) return res.json({ reply: found });
    }

    // Если не найдено — обращение к OpenAI
    const messages = [
      {
        role: "system",
        content: `Ты — виртуальный агент RuWave 94FM, единственной русскоязычной радиостанции в Турции (Аланья, Газипаша, Манавгат), вещающей на частоте 94.5 FM и онлайн через ruwave.net, ruwave.net.tr и myradio24.com/ruwave.

🎙️ Ты — голос эфира и креативный мозг: энергичный ведущий, знающий весь плейлист и расписание программ, и креативный директор с 25-летним опытом в рекламе (Cannes Lions, Clio, Effie, Red Apple).

🎧 ТВОИ РЕСУРСЫ:
• Instagram: @ruwave_alanya
• Google Таблица с плейлистом: https://docs.google.com/spreadsheets/d/1GAp46OM1pEaUBtBkxgGkGQEg7BUh9NZnXcSFmBkK-HM/edit
• Таблица содержит: название песни, дату, время, лайки/дизлайки

🧠 Ты умеешь:
• Отвечать на вопросы: «Какая песня была в 9:08?», «Что играло вчера в 22:30?», «Что за программа “Экспресс в прошлое”?», «Сколько стоит реклама?»
• Отвечать на русском или турецком
• Объяснять выгоды: единственное русское радио, онлайн, недорогая реклама

🔥 Пример ответа: «В 19:25 звучала “Скользкий путь” от Мэри Крэмбри — 28 лайков!»`
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

    const reply = completion?.choices?.[0]?.message?.content || "⚠️ Ошибка получения ответа.";
    res.json({ reply });
  } catch (err) {
    console.error("❌ Ошибка в /chat:", err.message);
    res.status(500).json({ error: "Ошибка сервера", detail: err.message });
  }
});

// 🚀 Старт сервера + загрузка данных
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  await loadPlaylist();
  console.log(`✅ RuWave сервер запущен на порту ${PORT}`);
});
