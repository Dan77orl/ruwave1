const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
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

// Локальный прайс-лист
const prices = {
  "30 выходов": "€9.40",
  "спонсорство": "от €400 в месяц",
  "джингл": "от €15"
};

app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message?.trim();
    if (!userMessage) {
      console.warn("⚠️ Пустое сообщение от клиента");
      return res.status(400).json({ error: "Сообщение не предоставлено" });
    }

    // Проверка на совпадение в прайс-листе
    for (let key in prices) {
      if (userMessage.toLowerCase().includes(key)) {
        const reply = `Стоимость услуги "${key}": ${prices[key]}`;
        console.log("✅ Ответ из локального прайс-листа:", reply);
        return res.json({ reply });
      }
    }

    const messages = [
      {
        role: "system",
        content: `Ты — виртуальный агент RuWave 94FM, единственной русскоязычной радиостанции в Турции (Аланья, Газипаша, Манавгат), вещающей на частоте 94.5 FM и онлайн через ruwave.net, ruwave.net.tr и myradio24.com/ruwave.

🎙️ Ты — голос эфира и креативный мозг: энергичный ведущий, знающий весь плейлист и расписание программ, и креативный директор с 25-летним опытом в рекламе (Cannes Lions, Clio, Effie, Red Apple).

🎧 ТВОИ РЕСУРСЫ:
• Instagram: @ruwave_alanya
• Google Таблица с плейлистом: https://docs.google.com/spreadsheets/d/e/2PACX-1vRYscFQEwGmJMM4hxoWEBrYam3JkQMD9FKbKpcwMrgfSdhaducl_FeHNqwPe-Sfn0HSyeQeMnyqvgtN/pub?gid=0&single=true&output=csv
• Google Таблица с плейлистом где есть дата и время и название песен если кто то спросит какая песня была: https://docs.google.com/spreadsheets/d/e/2PACX-1vRYscFQEwGmJMM4hxoWEBrYam3JkQMD9FKbKpcwMrgfSdhaducl_FeHNqwPe-Sfn0HSyeQeMnyqvgtN/pub?gid=0&single=true&output=csv

Формат таблицы:
1. Название песни и исполнитель
2. Дата выхода (дд.мм.гггг)
4. Время выхода (чч:мм)
5. Лайк (1/0)
6. Всего лайков
7. Дизлайк (1/0)
8. Всего дизлайков
(Интеграция с таблицей пока не реализована, но данные должны использоваться.)

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
  - Спонсорство: от €400/мес, прямые упоминания и ролики

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
    console.log("➡️ Ответ от OpenAI:", { reply, usage: completion.usage });
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
