const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fetch = require("node-fetch");
const OpenAI = require("openai");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

if (!process.env.OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY не найден в .env");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 🗓 форматирование дат
function formatDate(d) {
  return d.toLocaleDateString("ru-RU").split(".").map(p => p.padStart(2, "0")).join(".");
}

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatDate(d);
}

// 🕐 извлечение времени из текста
function extractTime(text) {
  const match = text.match(/(?:в\s*)?(\d{1,2})(?:[:.](\d{1,2}))?/i);
  if (!match) return null;
  const h = match[1].padStart(2, "0");
  const m = match[2] ? match[2].padStart(2, "0") : "00";
  return `${h}:${m}`;
}

// 📥 чтение CSV и поиск песни
async function getSongFromCSV(date, timePrefix) {
  try {
    const url = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQhW-be2zrRgzXZg8CaLpbq_kZN667bMxyk0vrcT_4dSck826ZSnlNHF8fGtLS8JKASYY6Td9xOlplW/pub?output=csv";
    const res = await fetch(url);
    const text = await res.text();
    const rows = text.trim().split("\n").map(r => r.split(","));

    const headers = rows[0];
    const dateIdx = headers.findIndex(h => h.toLowerCase().includes("date"));
    const timeIdx = headers.findIndex(h => h.toLowerCase().includes("time"));
    const songIdx = headers.findIndex(h => h.toLowerCase().includes("song"));

    const found = rows.find((row, i) => {
      if (i === 0) return false;
      const rowDate = row[dateIdx]?.trim();
      const rowTime = row[timeIdx]?.trim();
      return rowDate === date && rowTime.startsWith(timePrefix);
    });

    return found ? found[songIdx]?.trim() : null;
  } catch (e) {
    console.error("❌ Ошибка чтения таблицы:", e);
    return null;
  }
}

// 📡 Главная логика чата
app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message?.trim();
    if (!userMessage) return res.status(400).json({ error: "Пустое сообщение" });

    // 🔍 Вопрос про песню
    if (/какая песня.*(вчера|позавчера|сегодня)/i.test(userMessage)) {
      const date = /позавчера/i.test(userMessage)
        ? formatDate(new Date(Date.now() - 2 * 86400000))
        : /вчера/i.test(userMessage)
        ? getYesterday()
        : formatDate(new Date());

      const time = extractTime(userMessage) || "00:00";
      const song = await getSongFromCSV(date, time.slice(0, 5));

      if (song) {
        return res.json({ reply: `🎵 В ${time} ${date} играла: ${song}` });
      } else {
        return res.json({ reply: `🎧 Не нашёл песню на ${date} около ${time}` });
      }
    }

    // 🤖 Если не песня — используем GPT
    const messages = [
      {
        role: "system",
        content: "Ты — виртуальный агент RuWave 94FM. Отвечай на вопросы о радио, программе, рекламе, плейлисте."
      },
      { role: "user", content: userMessage }
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: 500,
      temperature: 0.7
    });

    const reply = completion.choices[0].message.content || "⚠️ GPT не ответил.";
    res.json({ reply });
  } catch (err) {
    console.error("❌ Ошибка в /chat:", err);
    res.status(500).json({ error: "Ошибка сервера", detail: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Сервер RuWave запущен на порту ${PORT}`));
