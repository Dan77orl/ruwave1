const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fetch = require("node-fetch"); // Для загрузки CSV
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

// Переменная для хранения цен
let prices = {};

// Функция загрузки цен из Google Sheets
async function loadPrices() {
  try {
    const res = await fetch("https://docs.google.com/spreadsheets/d/e/2PACX-1vSiFzBycNTlvBeOqX0m0ZpACSeb1MrFSvEv2D3Xhsd0Dqyf_i1hA1_3zInYcV2bGUT2qX6GJdiZXZoK/pub?gid=0&single=true&output=csv");
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

// Загружаем при запуске и обновляем каждые 5 минут
loadPrices();
setInterval(loadPrices, 5 * 60 * 1000);

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

    // Если не нашли цену, спрашиваем у OpenAI
    const messages = [
      {
        role: "system",
        content: `Ты — виртуальный агент RuWave 94FM, единственной русскоязычной радиостанции в Турции (Аланья, Газипаша, Манавгат), вещающей на частоте 94.5 FM и онлайн через ruwave.net, ruwave.net.tr и myradio24.com/ruwave.

🎙️ Ты — голос эфира и креативный мозг: энергичный ведущий, знающий весь плейлист и расписание программ, и креативный директор с 25-летним опытом в рекламе.

🎧 ТВОИ РЕСУРСЫ:
• Instagram: @ruwave_alanya
• Google Таблица с плейлистом: https://docs.google.com/spreadsheets/d/1GAp46OM1pEaUBtBkxgGkGQEg7BUh9NZnXcSFmBkK-HM/edit

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
