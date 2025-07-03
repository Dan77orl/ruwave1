const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fetch = require("node-fetch");
const OpenAI = require("openai");

dotenv.config();

if (!process.env.OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY не найден в .env");
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 📅 Поддержка вычисления дат
function todayMinus(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
}

// 🕐 Приводим время к hh:mm
function formatTime(raw) {
  if (!raw) return "";
  const parts = raw.trim().split(":");
  const h = (parts[0] || "00").padStart(2, "0");
  const m = (parts[1] || "00").padStart(2, "0");
  return `${h}:${m}`;
}

// 🎵 Плейлист
let playlist = [];

async function loadPlaylist() {
  try {
    const res = await fetch("https://docs.google.com/spreadsheets/d/e/2PACX-1vSiFzBycNTlvBeOqX0m0ZpACSeb1MrFSvEv2D3Xhsd0Dqyf_i1hA1_3zInYcV2bGUT2qX6GJdiZXZoK/pub?gid=0&single=true&output=csv");
    const text = await res.text();
    const rows = text.trim().split("\n").map(r => r.split(","));

    const headers = rows[0].map(h => h.trim().toLowerCase());
    const dateIdx = headers.findIndex(h => h.includes("date"));
    const timeIdx = headers.findIndex(h => h.includes("timestamp"));
    const songIdx = headers.findIndex(h => h.includes("song"));

    playlist = rows.slice(1).map(row => ({
      date: row[dateIdx]?.trim(),
      time: formatTime(row[timeIdx]),
      song: row[songIdx]?.trim()
    })).filter(r => r.date && r.time && r.song);

    console.log(`✅ Плейлист загружен: ${playlist.length} записей`);
  } catch (err) {
    console.error("❌ Ошибка загрузки плейлиста:", err);
  }
}

loadPlaylist();
setInterval(loadPlaylist, 60 * 60 * 1000); // обновлять каждый час

function findSongsByDateTime(date, startTime, endTime) {
  const toMinutes = t => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
  };

  const start = toMinutes(startTime);
  const end = toMinutes(endTime);

  console.log(`🔍 Ищем песни за ${date} с ${startTime} (${start}) до ${endTime} (${end})`);

  const matches = playlist.filter(entry => {
    const entryMinutes = toMinutes(entry.time);
    const isMatch = entry.date === date && entryMinutes >= start && entryMinutes <= end;

    // Отладочная информация по каждой строке
    if (entry.date === date) {
      console.log(`🎵 ${entry.date} ${entry.time} → ${entry.song} | Минуты: ${entryMinutes} | Совпадение: ${isMatch}`);
    }

    return isMatch;
  });

  console.log(`✅ Совпадений найдено: ${matches.length}`);
  return matches;
}


// 🧠 Парсинг времени и даты через GPT
async function parseDateTimeWithGPT(userMessage) {
  const now = new Date();
  const today = `${now.getDate().toString().padStart(2, '0')}.${(now.getMonth() + 1).toString().padStart(2, '0')}.${now.getFullYear()}`;

  const messages = [
    {
      role: "system",
      content: `Сегодня ${today}.

Ты — ассистент радиостанции RuWave. Определи дату и диапазон времени из запроса пользователя.

Формат ответа строго JSON:
{"date":"дд.мм.гггг", "start":"чч:мм", "end":"чч:мм"}

Правила:
- Если указано "вчера", используй дату: ${todayMinus(1)}
- Если "позавчера" — ${todayMinus(2)}
- Если "10 дней назад" — ${todayMinus(10)}
- Если дата указана явно — используй её
- Если не указана — используй сегодняшнюю (${today})
- Если указано "в 7 вечера", это с 19:00 до 19:59
- Если указано "в 9 утра", это с 09:00 до 09:59
- Время всегда в 24-часовом формате
- Отвечай ТОЛЬКО в формате JSON — никаких пояснений`
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
    return JSON.parse(reply);
  } catch (e) {
    console.error("❌ Невозможно распарсить JSON от GPT:", reply);
    return null;
  }
}

// 📡 Главный эндпоинт
app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message?.trim();
    if (!userMessage) return res.status(400).json({ error: "Пустое сообщение" });

    const playlistCheck = /что играло|какая песня|что за песня|что было/i.test(userMessage);
    if (playlistCheck) {
      const dateTime = await parseDateTimeWithGPT(userMessage);

      if (dateTime?.date && dateTime?.start && dateTime?.end) {
        const results = findSongsByDateTime(dateTime.date, dateTime.start, dateTime.end);

        if (results.length > 0) {
          const list = results.map(r => r.song).join("\n");
          return res.json({ reply: `🎧 Песни за ${dateTime.date} с ${dateTime.start} до ${dateTime.end}:\n${list}` });
        } else {
          return res.json({ reply: `🎧 За ${dateTime.date} с ${dateTime.start} до ${dateTime.end} песни не найдены.` });
        }
      } else {
        return res.json({ reply: "❌ Не удалось распознать дату и время запроса." });
      }
    }

    // GPT для остальных вопросов
    const messages = [
      {
        role: "system",
        content: `Ты — виртуальный агент RuWave 94FM. Ты отвечаешь на вопросы о радио, программе, рекламе, плейлисте.`
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

    const reply = completion?.choices?.[0]?.message?.content || "⚠️ Ответ не получен.";
    res.json({ reply });
  } catch (err) {
    console.error("❌ Ошибка в /chat:", err);
    res.status(500).json({ error: "Ошибка сервера", detail: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Сервер RuWave работает на порту ${PORT}`));
