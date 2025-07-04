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

// Переменные для хранения данных
let prices = {};
let playlist = [];

// Функция загрузки цен из Google Sheets
async function loadPrices() {
  try {
    const res = await fetch(
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vRYscFQEwGmJMM4hxoWEBrYam3JkQMD9FKbKpcwMrgfSdhaducl_FeHNqwPe-Sfn0HSyeQeMnyqvgtN/pub?gid=0&single=true&output=csv"
    );
    const text = await res.text();
    const rows = text.trim().split("\n");

    const newPrices = {};
    for (let row of rows) {
      const [name, price] = row.split(",");
      if (name && price) {
        newPrices[name.trim().toLowerCase()] = price.trim();
      }
    }

    prices = newPrices;
    console.log("✅ Цены обновлены:", prices);
  } catch (err) {
    console.error("❌ Ошибка загрузки цен:", err);
  }
}

// Функция загрузки плейлиста из Google Sheets
async function loadPlaylist() {
  try {
    const res = await fetch(
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vSiFzBycNTlvBeOqX0m0ZpACSeb1MrFSvEv2D3Xhsd0Dqyf_i1hA1_3zInYcV2bGUT2qX6GJdiZXZoK/pub?gid=0&single=true&output=csv"
    );
    const text = await res.text();
    const rows = text.trim().split("\n");
    
    const headers = rows[0].split(",");
    const newPlaylist = [];
    
    for (let i = 1; i < rows.length; i++) {
      const [song, date, time, likes, totalLikes, dislikes, totalDislikes] = rows[i].split(",");
      if (song && date && time) {
        newPlaylist.push({
          song: song.trim(),
          date: date.trim(),
          time: time.trim(),
          likes: likes ? parseInt(likes) : 0,
          totalLikes: totalLikes ? parseInt(totalLikes) : 0,
          dislikes: dislikes ? parseInt(dislikes) : 0,
          totalDislikes: totalDislikes ? parseInt(totalDislikes) : 0,
        });
      }
    }

    playlist = newPlaylist;
    console.log("✅ Плейлист обновлён:", playlist.length, "песен");
  } catch (err) {
    console.error("❌ Ошибка загрузки плейлиста:", err);
  }
}

// Функция для парсинга времени и даты из запроса пользователя
function parseDateTimeFromMessage(message) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0]; // Формат YYYY-MM-DD

  const timeRangeRegex = /(\d{1,2}):(\d{2})\s*(?:до|to|-)\s*(\d{1,2}):(\d{2})/i;
  const exactTimeRegex = /(\d{1,2}):(\d{2})/;
  const dateRegex = /(\d{2})\.(\d{2})\.(\d{4})/;

  let date = yesterdayStr;
  let startTime = null;
  let endTime = null;
  let exactTime = null;

  const dateMatch = message.match(dateRegex);
  if (dateMatch) {
    date = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`; // DD.MM.YYYY -> YYYY-MM-DD
  }

  const timeRangeMatch = message.match(timeRangeRegex);
  if (timeRangeMatch) {
    startTime = `${timeRangeMatch[1]}:${timeRangeMatch[2]}`;
    endTime = `${timeRangeMatch[3]}:${timeRangeMatch[4]}`;
  } else {
    const exactTimeMatch = message.match(exactTimeRegex);
    if (exactTimeMatch) {
      exactTime = `${exactTimeMatch[1]}:${exactTimeMatch[2]}`;
    }
  }

  return { date, startTime, endTime, exactTime };
}

// Функция для поиска песен по дате и времени
function findSongsByDateTime(date, startTime, endTime, exactTime) {
  const normalizeTime = (time) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const filteredSongs = playlist.filter((entry) => {
    if (entry.date !== date) return false;

    if (exactTime) {
      return entry.time === exactTime;
    } else if (startTime && endTime) {
      const entryMinutes = normalizeTime(entry.time);
      const startMinutes = normalizeTime(startTime);
      const endMinutes = normalizeTime(endTime);
      return entryMinutes >= startMinutes && entryMinutes <= endMinutes;
    }
    return false;
  });

  return filteredSongs;
}

// Загружаем данные при запуске и обновляем каждые 5 минут
loadPrices();
loadPlaylist();
setInterval(loadPrices, 5 * 60 * 1000);
setInterval(loadPlaylist, 5 * 60 * 1000);

app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message?.trim();
    if (!userMessage) {
      console.warn("⚠️ Пустое сообщение от клиента");
      return res.status(400).json({ error: "Сообщение не предоставлено" });
    }

    // Проверяем, спрашивает ли пользователь про цену
    let foundKey = null;
    let foundPrice = null;
    for (const key in prices) {
      if (userMessage.toLowerCase().includes(key)) {
        foundKey = key;
        foundPrice = prices[key];
        break;
      }
    }

    if (foundPrice) {
      const reply = `💰 Актуальная стоимость "${foundKey}": ${foundPrice}`;
      console.log("✅ Ответ из прайс-листа:", reply);
      return res.json({ reply });
    }

    // Проверяем, спрашивает ли пользователь про песни
    if (
      userMessage.toLowerCase().includes("какая песня") ||
      userMessage.toLowerCase().includes("что играло") ||
      userMessage.toLowerCase().includes("плейлист")
    ) {
      const { date, startTime, endTime, exactTime } = parseDateTimeFromMessage(userMessage);
      const songs = findSongsByDateTime(date, startTime, endTime, exactTime);

      if (songs.length > 0) {
        let reply = "🎵 В указанное время играли следующие песни:\n";
        songs.forEach((song) => {
          reply += `• ${song.song} в ${song.time} (Лайков: ${song.totalLikes}, Дизлайков: ${song.totalDislikes})\n`;
        });
        console.log("✅ Ответ из плейлиста:", reply);
        return res.json({ reply });
      } else {
        const reply = "⚠️ Не удалось найти песни за указанное время.";
        console.log("⚠️ Песни не найдены:", { date, startTime, endTime, exactTime });
        return res.json({ reply });
      }
    }

    // Если не нашли цену или песни, спрашиваем у OpenAI
    const messages = [
      {
        role: "system",
        content: `Ты — виртуальный агент RuWave 94FM, единственной русскоязычной радиостанции в Турции (Аланья, Газипаша, Манавгат), вещающей на частоте 94.5 FM и онлайн через ruwave.net, ruwave.net.tr и myradio24.com/ruwave.

🎙️ Ты — голос эфира и креативный мозг: энергичный ведущий, знающий весь плейлист и расписание программ, и креативный директор с 25-летним опытом в рекламе.

🎧 ТВОИ РЕСУРСЫ:
• Instagram: @ruwave_alanya
• Google Таблица с плейлистом: https://docs.google.com/spreadsheets/d/e/2PACX-1vSiFzBycNTlvBeOqX0m0ZpACSeb1MrFSvEv2D3Xhsd0Dqyf_i1hA1_3zInYcV2bGUT2qX6GJdiZXZoK/pub?gid=0&single=true&output=csv

Формат таблицы:
1. Название песни и исполнитель
2. Дата выхода
3. Время выхода
4. Лайк
5. Всего лайков
6. Дизлайк
7. Всего дизлайков

🧠 Ты умеешь:
• Отвечать на вопросы о песнях, программах и рекламе
• Говорить на русском и турецком
• Придумывать креативные тексты и предложения
🔥 Пример ответа: «В 19:25 на RuWave звучала “Скользкий путь” от Мэри Крэмбри — песня собрала уже 28 лайков!»`
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
    console.log("➡️ Ответ от OpenAI:", { reply });
    res.json({ reply });
  } catch (err) {
    console.error("❌ Ошибка в /chat:", {
      message: err.message,
      status: err.status,
      stack: err.stack
    });
    res.status(500).json({ error: "Ошибка сервера", detail: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ RuWave сервер запущен на порту ${PORT}`));
