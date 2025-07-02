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

// Инициализация OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Переменная для хранения плейлиста
let playlist = [];

// 📥 Загрузка данных из Google Таблицы
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

// Загружаем при запуске и обновляем каждый час
loadPlaylist();
setInterval(loadPlaylist, 60 * 60 * 1000);

// 🔍 Поиск песен по дате и времени
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

// 🕵️ Парсинг даты и времени из текста
function parseDateTimeFromMessage(message) {
  const now = new Date();

  // По умолчанию — сегодняшняя дата и весь день
  let date = `${now.getDate().toString().padStart(2, '0')}.${(now.getMonth() + 1).toString().padStart(2, '0')}.${now.getFullYear()}`;
  let startTime = "00:00";
  let endTime = "23:59";

  // Вчера
  if (/вчера/i.test(message)) {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    date = `${yesterday.getDate().toString().padStart(2, '0')}.${(yesterday.getMonth() + 1).toString().padStart(2, '0')}.${yesterday.getFullYear()}`;
  }

  // Конкретная дата (например, 1 июля)
  const dateMatch = message.match(/(\d{1,2})\s*(июля|июня|мая|августа|сентября|октября|ноября|декабря)/i);
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, "0");
    const monthNames = {
      января: "01", февраля: "02", марта: "03", апреля: "04",
      мая: "05", июня: "06", июля: "07", августа: "08",
      сентября: "09", октября: "10", ноября: "11", декабря: "12"
    };
    const month = monthNames[dateMatch[2].toLowerCase()];
    const year = now.getFullYear();
    date = `${day}.${month}.${year}`;
  }

  // Диапазон времени (с 9 до 11)
  const rangeMatch = message.match(/с\s*(\d{1,2})\s*(?:[:.](\d{1,2}))?\s*(?:до|–|-)\s*(\d{1,2})\s*(?:[:.](\d{1,2}))?/i);
  if (rangeMatch) {
    const h1 = rangeMatch[1].padStart(2, "0");
    const m1 = (rangeMatch[2] || "00").padStart(2, "0");
    const h2 = rangeMatch[3].padStart(2, "0");
    const m2 = (rangeMatch[4] || "59").padStart(2, "0");

    startTime = `${h1}:${m1}`;
    endTime = `${h2}:${m2}`;
  }

  // Конкретное время (в 21:30)
  const timeMatch = message.match(/в\s*(\d{1,2})[:.](\d{1,2})/i);
  if (timeMatch) {
    const h = timeMatch[1].padStart(2, "0");
    const m = timeMatch[2].padStart(2, "0");
    startTime = `${h}:${m}`;
    endTime = `${h}:${m}`;
  }

  // Утром, днём, вечером, ночью
  if (/утром/i.test(message)) {
    startTime = "06:00";
    endTime = "11:59";
  } else if (/днем|днём/i.test(message)) {
    startTime = "12:00";
    endTime = "17:59";
  } else if (/вечером/i.test(message)) {
    startTime = "18:00";
    endTime = "23:59";
  } else if (/ночью/i.test(message)) {
    startTime = "00:00";
    endTime = "05:59";
  }

  return { date, startTime, endTime };
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
      const { date, startTime, endTime } = parseDateTimeFromMessage(userMessage);
      const results = findSongsByDateTime(date, startTime, endTime);

      if (results.length > 0) {
        const list = results.map(r => `${r.time} — ${r.song}`).join("\n");
        return res.json({ reply: `🎧 Песни за ${date} с ${startTime} до ${endTime}:\n${list}` });
      } else {
        return res.json({ reply: `🎧 За ${date} с ${startTime} до ${endTime} песни не найдены.` });
      }
    }

    // GPT для всего остального
    const messages = [
      {
        role: "system",
        content: `Ты — виртуальный агент RuWave 94FM, единственной русскоязычной радиостанции в Турции (Аланья, Газипаша, Манавгат), вещающей на частоте 94.5 FM и онлайн через ruwave.net, ruwave.net.tr и myradio24.com/ruwave.

🎙️ Ты — голос эфира и креативный мозг: энергичный ведущий, знающий весь плейлист и расписание программ, и креативный директор с 25-летним опытом в рекламе (Cannes Lions, Clio, Effie, Red Apple).

🎧 ТВОИ РЕСУРСЫ:
• Instagram: @ruwave_alanya
• Google Таблица с плейлистом: https://docs.google.com/spreadsheets/d/1GAp46OM1pEaUBtBkxgGkGQEg7BUh9NZnXcSFmBkK-HM/edit

Формат таблицы:
1. Название песни и исполнитель
2. Дата выхода (дд.мм.гггг)
3. Время выхода (чч:мм)
4. Лайк (1/0)
5. Всего лайков
6. Дизлайк (1/0)
7. Всего дизлайков

🧠 Ты умеешь:
• Отвечать: «Какая песня сейчас играет?», «Что было в 22:30 вчера?», «Что за программа “Экспресс в прошлое”?», «Сколько стоит реклама на RuWave?»
• Отвечать на русском или турецком — в зависимости от языка запроса

🎨 Как креативный директор:
• Придумываешь рекламные тексты: инфо, диалоги, имидж
• Предлагаешь форматы: джинглы, спонсорство, вставки
• Объясняешь выгоды:
  - Единственное русское радио в регионе
  - Вещание 24/7 FM + Онлайн
  - Прямая связь с аудиторией
  - Цены: от €4 до €9.40 / 30 выходов, скидки от бюджета, надбавки за позицию
  - Спонсорство: от €400/мес, прямые упоминания и ролики`
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
