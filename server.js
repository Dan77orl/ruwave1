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

// 🎶 Плейлист
let playlist = [];

// 📥 Загрузка данных из Google Таблицы
async function loadPlaylist() {
  try {
    const res = await fetch("https://docs.google.com/spreadsheets/d/e/2PACX-1vSiFzBycNTlvBeOqX0m0ZpACSeb1MrFSvEv2D3Xhsd0Dqyf_i1hA1_3zInYcV2bGUT2qX6GJdiZXZoK/pub?gid=0&single=true&output=csv");
    const text = await res.text();
    const rows = text.trim().split("\n").map(r => r.split(","));

    const headers = rows[0].map(h => h.trim().toLowerCase());
    const dateIdx = headers.findIndex(h => h.includes('date'));
    const timeIdx = headers.findIndex(h => h.includes('timestamp'));
    const songIdx = headers.findIndex(h => h.includes('song'));

    playlist = rows.slice(1).map(row => ({
      date: row[dateIdx]?.trim(),
      time: row[timeIdx]?.trim().slice(0, 5), // убираем секунды
      song: row[songIdx]?.trim()
    })).filter(r => r.date && r.time && r.song);

    console.log(`✅ Плейлист обновлён: ${playlist.length} записей загружено`);
  } catch (err) {
    console.error("❌ Ошибка загрузки плейлиста:", err);
  }
}

loadPlaylist();
setInterval(loadPlaylist, 60 * 60 * 1000);

// 🔍 Поиск песен по дате и времени
function findSongsByDateTime(date, startTime, endTime) {
  const toMinutes = t => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
  };

  const start = toMinutes(startTime);
  const end = toMinutes(endTime);

  return playlist.filter(entry => {
    if (entry.date !== date) return false;
    const time = toMinutes(entry.time);
    return time >= start && time <= end;
  });
}

// 🧠 Парсинг даты и времени с помощью GPT
async function parseDateTimeWithGPT(userMessage) {
  const messages = [
    {
      role: "system",
      content: `Ты — ассистент радиостанции RuWave. Определи дату и диапазон времени из запроса пользователя.

Правила:
- Если указано "вчера", укажи "dateShift": -1.
- Если указано "позавчера", "dateShift": -2.
- Если указано "10 дней назад", "dateShift": -10.
- Если указана конкретная дата (например, 1 июля), укажи её в поле "date": "01.07.2025".
- Если дата не указана — используй сегодня ("dateShift": 0).
- Если время не указано, ставь с "00:00" до "23:59".
- Если указано "в 9 вечера", это с "21:00" до "21:59".
- Ответ строго в формате JSON:
{"dateShift": -1, "start": "21:00", "end": "21:59"}
или
{"date": "дд.мм.гггг", "start": "чч:мм", "end": "чч:мм"}.`
    },
    { role: "user", content: userMessage }
  ];

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages,
    max_tokens: 300,
    temperature: 0.2
  });

  const reply = completion.choices[0].message.content;
  try {
    const json = JSON.parse(reply);
    return json;
  } catch (e) {
    console.error("❌ Ошибка парсинга JSON от GPT:", reply);
    return null;
  }
}

// 🚀 Главный эндпоинт чата
app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message?.trim();
    if (!userMessage) {
      return res.status(400).json({ error: "Сообщение не предоставлено" });
    }

    const playlistCheck = /что играло|какая песня|что за песня|что было/i.test(userMessage);

    if (playlistCheck) {
      const dateTime = await parseDateTimeWithGPT(userMessage);

      if (dateTime) {
        let date = dateTime.date;

        if (!date && typeof dateTime.dateShift === 'number') {
          const targetDate = new Date();
          targetDate.setDate(targetDate.getDate() + dateTime.dateShift);
          date = `${targetDate.getDate().toString().padStart(2, '0')}.${(targetDate.getMonth() + 1).toString().padStart(2, '0')}.${targetDate.getFullYear()}`;
        }

        if (!date) {
          return res.json({ reply: "❌ Не удалось определить дату из запроса." });
        }

        const start = dateTime.start || "00:00";
        const end = dateTime.end || "23:59";

        const results = findSongsByDateTime(date, start, end);

        if (results.length > 0) {
          const list = results.map(r => `${r.song}`).join("\n");
          return res.json({ reply: `🎧 Песни за ${date} с ${start} до ${end}:\n${list}` });
        } else {
          return res.json({ reply: `🎧 За ${date} с ${start} до ${end} песни не найдены.` });
        }
      } else {
        return res.json({ reply: "❌ Не удалось определить дату и время из запроса." });
      }
    }

    // GPT для всего остального
    const messages = [
      {
        role: "system",
        content: `Ты — виртуальный агент RuWave 94FM, русскоязычной радиостанции в Турции. Ты знаешь расписание, плейлист и рекламу.

Ты умеешь:
- Отвечать: «Какая песня сейчас играет?», «Что было вчера в 22:30?», «Сколько стоит реклама на RuWave?»
- Отвечать на русском или турецком.
- Объяснять выгоды радио, создавать рекламные тексты, придумывать джинглы.`
      },
      {
        role: "user",
        content: userMessage
      }
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
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
