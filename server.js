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

// 📅 Вспомогательная функция
function todayMinus(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
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
      time: row[timeIdx]?.trim().slice(0, 5), // "1:54:06" → "1:54"
      song: row[songIdx]?.trim()
    })).filter(r => r.date && r.time && r.song);

    console.log(`✅ Загружено записей: ${playlist.length}`);
  } catch (err) {
    console.error("❌ Ошибка загрузки плейлиста:", err);
  }
}

loadPlaylist();
setInterval(loadPlaylist, 60 * 60 * 1000); // обновление каждый час

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

async function parseDateTimeWithGPT(userMessage) {
  const now = new Date();
  const today = `${now.getDate().toString().padStart(2, '0')}.${(now.getMonth() + 1).toString().padStart(2, '0')}.${now.getFullYear()}`;

  const messages = [
    {
      role: "system",
      content: `Сегодня ${today}.

Ты — ассистент радиостанции RuWave. Определи дату и диапазон времени из запроса пользователя.

Формат ответа:
{"date":"дд.мм.гггг", "start":"чч:мм", "end":"чч:мм"}

🔹 Правила:
- Если указано "вчера", используй дату: ${todayMinus(1)}
- Если "позавчера" — ${todayMinus(2)}
- Если "10 дней назад" — ${todayMinus(10)}
- Если дата указана явно, используй её
- Если не указано — используй сегодняшнюю (${today})
- Если время не указано — с 00:00 до 23:59
- "в 7 вечера" = с 19:00 до 19:59, "в 9 утра" = с 09:00 до 09:59
- Ответ только в формате JSON — ничего лишнего.`
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

app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message?.trim();
    if (!userMessage) return res.status(400).json({ error: "Нет текста сообщения" });

    const playlistQuery = /что играло|какая песня|что за песня|что было/i.test(userMessage);
    if (playlistQuery) {
      const dateTime = await parseDateTimeWithGPT(userMessage);

      if (dateTime?.date && dateTime?.start && dateTime?.end) {
        const { date, start, end } = dateTime;
        const results = findSongsByDateTime(date, start, end);

        if (results.length > 0) {
          const list = results.map(r => r.song).join("\n");
          return res.json({ reply: `🎧 Песни за ${date} с ${start} до ${end}:\n${list}` });
        } else {
          return res.json({ reply: `🎧 За ${date} с ${start} до ${end} песни не найдены.` });
        }
      } else {
        return res.json({ reply: "❌ Не удалось определить дату/время из запроса." });
      }
    }

    // OpenAI — остальное
    const messages = [
      {
        role: "system",
        content: `Ты — виртуальный агент RuWave 94FM. Помогаешь с эфиром, программами, рекламой, расписанием, плейлистом.`
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

    const reply = completion.choices?.[0]?.message?.content || "⚠️ Ошибка получения ответа от модели.";
    res.json({ reply });
  } catch (err) {
    console.error("❌ Ошибка в /chat:", err);
    res.status(500).json({ error: "Ошибка сервера", detail: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ RuWave сервер запущен на порту ${PORT}`));
