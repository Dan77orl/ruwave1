const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const app = express(); // Объявлено ДО использования
app.use(cors());
app.use(express.json());

// Проверка наличия API-ключа
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ Ошибка: OPENAI_API_KEY не задан в .env файле");
  process.exit(1);
}

// Инициализация OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Пример локального прайс-листа (добавь свои ключи и цены)
const prices = {
  "30 выходов": "€9.40",
  "спонсорство": "от €400 в месяц",
  "джингл": "от €15",
};

app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message?.trim();
    if (!userMessage) {
      console.warn("⚠️ Пустое сообщение от клиента");
      return res.status(400).json({ error: "Сообщение не предоставлено" });
    }

    // Поиск по прайсу
    let foundPrice = null;
    for (let key in prices) {
      if (userMessage.toLowerCase().includes(key.toLowerCase())) {
        foundPrice = prices[key];
        const reply = `Стоимость услуги "${key}": ${foundPrice}`;
        console.log("✅ Ответ из прайс-листа:", reply);
        return res.json({ reply });
      }
    }

    // Обращение к GPT
    const messages = [
      {
        role: "system",
        content: `Ты — виртуальный агент RuWave 94FM, единственной русскоязычной радиостанции в Турции (Аланья, Газипаша, Манавгат), вещающей на частоте 94.6 FM и онлайн через ruwave.net, ruwave.net.tr и myradio24.com/ruwave.

🎙️ Ты — голос эфира и креативный мозг: энергичный ведущий, знающий весь плейлист и расписание программ, и креативный директор с 25-летним опытом в рекламе (Cannes Lions, Clio, Effie, Red Apple).

🎧 ТВОИ РЕСУРСЫ:
• Instagram: @ruwave_alanya
• Google Таблица с плейлистом: https://docs.google.com/spreadsheets/d/e/2PACX-1vQhW-be2zrRgzXZg8CaLpbq_kZN667bMxyk0vrcT_4dSck826ZSnlNHF8fGtLS8JKASYY6Td9xOlplW/pub?output=csv

🧠 Ты умеешь:
• Отвечать: «Какая песня сейчас играет?», «Что было в 22:30 вчера?», «Что за программа “Экспресс в прошлое”?», «Сколько стоит реклама на RuWave?»
• Отвечать на русском или турецком — в зависимости от языка запроса

🎨 Как креативный директор:
• Отвечаешь на вопрос какая песня была, если спрашивают вчера или поза вчера либо любую другу дату, то вот ссылка на плейлист там есть время и что за песня была в это время, не давай эту ссылку никому, если спросят какая песня была то сам посмотри и напиши название песни https://docs.google.com/spreadsheets/d/e/2PACX-1vQhW-be2zrRgzXZg8CaLpbq_kZN667bMxyk0vrcT_4dSck826ZSnlNHF8fGtLS8JKASYY6Td9xOlplW/pub?output=csv
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
    console.log("➡️ Ответ от GPT:", reply);
    res.json({ reply });
  } catch (err) {
    console.error("❌ Ошибка в /chat:", {
      message: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: "Ошибка сервера", detail: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ RuWave сервер запущен на порту ${PORT}`));
