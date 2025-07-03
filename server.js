const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const fetch = require("node-fetch");
const csv = require("csv-parser");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);
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

const prices = {
  "30 выходов": "€9.40",
  "спонсорство": "от €400 в месяц",
  "джингл": "от €15"
};

async function getPlaylistData() {
  const url = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSiFzBycNTlvBeOqX0m0ZpACSeb1MrFSvEv2D3Xhsd0Dqyf_i1hA1_3zInYcV2bGUT2qX6GJdiZXZoK/pub?gid=0&single=true&output=csv";
  const response = await fetch(url);
  if (!response.ok) throw new Error("Ошибка загрузки CSV");

  return new Promise((resolve, reject) => {
    const results = [];
    response.body
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => resolve(results))
      .on("error", reject);
  });
}

function findSong(data, mskDateTime) {
  const targetDate = mskDateTime.format("DD.MM.YYYY");
  const targetTime = mskDateTime.format("HH:mm");
  return data.find(row =>
    row["Дата выхода"]?.trim() === targetDate &&
    row["Время выхода"]?.trim() === targetTime
  );
}

app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message?.trim();
    if (!userMessage) {
      console.warn("⚠️ Пустое сообщение от клиента");
      return res.status(400).json({ error: "Сообщение не предоставлено" });
    }

    // Цены
    for (let key in prices) {
      if (userMessage.toLowerCase().includes(key)) {
        const reply = `Стоимость услуги "${key}": ${prices[key]}`;
        console.log("✅ Ответ из локального прайс-листа:", reply);
        return res.json({ reply });
      }
    }

    // Поиск песни по времени
    const regex = /(вчера|сегодня|позавчера).*?(\d{1,2}[:.]\d{2})/i;
    const match = userMessage.match(regex);

    if (match) {
      const [_, dayWord, timeStr] = match;
      let targetDate = dayjs().tz("Europe/Moscow");
      if (dayWord.includes("вчера")) targetDate = targetDate.subtract(1, 'day');
      if (dayWord.includes("позавчера")) targetDate = targetDate.subtract(2, 'day');

      const [hours, minutes] = timeStr.replace('.', ':').split(':');
      const mskTime = targetDate.set('hour', parseInt(hours)).set('minute', parseInt(minutes)).set('second', 0);

      try {
        const data = await getPlaylistData();
        const song = findSong(data, mskTime);

        if (song) {
          const reply = `🎵 В ${mskTime.format("HH:mm")} по МСК ${dayWord} играла песня: "${song["Название песни и исполнитель"]}" (👍 ${song["Всего лайков"] || 0}, 👎 ${song["Всего дизлайков"] || 0})`;
          return res.json({ reply });
        } else {
          return res.json({ reply: `⚠️ Не удалось найти песню в ${mskTime.format("HH:mm")} ${dayWord}. Возможно, данные ещё не обновлены.` });
        }
      } catch (e) {
        console.error("Ошибка загрузки таблицы:", e);
        return res.status(500).json({ error: "Ошибка загрузки таблицы", detail: e.message });
      }
    }

    // Если вопрос не про песню и не про прайс — идем в OpenAI
    const messages = [
      {
        role: "system",
        content: `Ты — виртуальный агент RuWave 94FM, единственной русскоязычной радиостанции в Турции (Аланья, Газипаша, Манавгат), вещающей на частоте 94.5 FM и онлайн через ruwave.net, ruwave.net.tr и myradio24.com/ruwave.

🎙️ Ты — голос эфира и креативный мозг: энергичный ведущий, знающий весь плейлист и расписание программ, и креативный директор с 25-летним опытом в рекламе (Cannes Lions, Clio, Effie, Red Apple).

🎧 ТВОИ РЕСУРСЫ:
• Instagram: @ruwave_alanya
• Google Таблица с плейлистом: https://docs.google.com/spreadsheets/d/1GAp46OM1pEaUBtBkxgGkGQEg7BUh9NZnXcSFmBkK-HM/edit
• CSV с песнями по времени: https://docs.google.com/spreadsheets/d/e/2PACX-1vSiFzBycNTlvBeOqX0m0ZpACSeb1MrFSvEv2D3Xhsd0Dqyf_i1hA1_3zInYcV2bGUT2qX6GJdiZXZoK/pub?gid=0&single=true&output=csv

🧠 Ты умеешь:
• Отвечать на вопросы о песнях, времени эфира, ценах, программах
• Говоришь на русском и турецком`
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
