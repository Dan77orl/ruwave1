const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const axios = require("axios"); // Добавляем axios для HTTP-запросов

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

if (!process.env.OPENAI_API_KEY) {
  console.error("❌ Ошибка: OPENAI_API_KEY не задан в .env файле");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const prices = {
  "30 выходов": "€9.40",
  "спонсорство": "от €400 в месяц",
  "джингл": "от €15",
};

// URL вашей Google Таблицы в формате CSV
const PLAYLIST_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQhW-be2zrRgzXZg8CaLpbq_kZN667bMxyk0vrcT_4dSck826ZSnlNHF8fGtLS8JKASYY6Td9xOlplW/pub?output=csv";

// Переменная для хранения плейлиста в памяти
let playlistData = [];

// Функция для загрузки и парсинга плейлиста
async function loadPlaylist() {
  try {
    console.log("⏳ Загрузка плейлиста из Google Таблицы...");
    const response = await axios.get(PLAYLIST_URL);
    const csvData = response.data;

    // Простой парсинг CSV (можно использовать библиотеку типа 'csv-parser' для более надежного парсинга)
    const lines = csvData.split("\n");
    const headers = lines[0].split(",").map((h) => h.trim()); // Предполагаем, что первая строка - это заголовки

    const parsedData = lines.slice(1).map((line) => {
      const values = line.split(",").map((v) => v.trim());
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index];
      });
      return row;
    });

    playlistData = parsedData.filter(row => Object.values(row).some(val => val !== undefined && val !== null && val !== '')); // Отфильтровываем пустые строки

    console.log(`✅ Плейлист загружен. Записей: ${playlistData.length}`);
    // console.log(playlistData); // Для отладки: посмотрите структуру данных
  } catch (error) {
    console.error(
      "❌ Ошибка при загрузке плейлиста:",
      error.message,
      error.stack
    );
  }
}

// Загружаем плейлист при запуске сервера
loadPlaylist();
// Можно также настроить периодическое обновление плейлиста (например, каждый час)
// setInterval(loadPlaylist, 3600000); // Обновлять каждый час (3600000 миллисекунд)

app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message?.trim();
    if (!userMessage) {
      console.warn("⚠️ Пустое сообщение от клиента");
      return res.status(400).json({ error: "Сообщение не предоставлено" });
    }

    // --- Логика поиска по прайсу (без изменений) ---
    let foundPrice = null;
    for (let key in prices) {
      if (userMessage.toLowerCase().includes(key.toLowerCase())) {
        foundPrice = prices[key];
        const reply = `Стоимость услуги "${key}": ${foundPrice}`;
        console.log("✅ Ответ из прайс-листа:", reply);
        return res.json({ reply });
      }
    }

    // --- НОВАЯ ЛОГИКА: Поиск по плейлисту ---
    const lowerCaseUserMessage = userMessage.toLowerCase();

    // Проверяем, задан ли вопрос о песне или дате/времени
    if (lowerCaseUserMessage.includes("какая песня была") ||
        lowerCaseUserMessage.includes("что играло") ||
        lowerCaseUserMessage.includes("песня вчера") ||
        lowerCaseUserMessage.includes("какая песня")) {

      // Пример простой логики поиска: ищем упоминания "вчера", "сегодня", "время"
      // Для более сложного парсинга даты/времени потребуется библиотека вроде 'moment' или 'date-fns'

      let responseFromPlaylist = "Извините, не могу найти информацию по плейлисту с учетом вашего запроса. Пожалуйста, попробуйте сформулировать точнее (например, 'Какая песня играла вчера в 22:30?').";

      // Очень упрощенный пример поиска по дате/времени
      // Предполагаем, что в вашей таблице есть столбцы типа "Дата" и "Время" и "Песня"
      // Вам нужно будет адаптировать это под реальные названия столбцов в вашей таблице
      // и формат данных.
      // Например, если таблица имеет столбцы "Date", "Time", "Artist", "Song Title"
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayString = yesterday.toISOString().split('T')[0]; // Получаем дату в формате YYYY-MM-DD

      const today = new Date();
      const todayString = today.toISOString().split('T')[0]; // Получаем дату в формате YYYY-MM-DD

      let foundSongs = [];

      // Поиск по вчерашнему дню (очень грубо, нужно уточнять формат даты в таблице)
      if (lowerCaseUserMessage.includes("вчера")) {
        // Предполагаем, что столбец с датой называется 'Date' и имеет формат YYYY-MM-DD
        const songsYesterday = playlistData.filter(song => {
          // Если у вас есть столбец 'Date'
          return song.Date && song.Date.includes(yesterdayString);
        });

        // Можно добавить логику для поиска по времени, если пользователь указал его (например, "в 22:30")
        // Это потребует более сложного парсинга userMessage для извлечения времени.

        if (songsYesterday.length > 0) {
            // Возьмем несколько последних песен со вчерашнего дня в качестве примера
            const lastFewSongs = songsYesterday.slice(-5); // последние 5 песен
            const songList = lastFewSongs.map(song => `"${song["Song Title"]}" от ${song["Artist"]}`).join(', '); // Адаптируйте названия столбцов
            responseFromPlaylist = `Вот некоторые песни, которые играли вчера: ${songList}.`;
        } else {
            responseFromPlaylist = "К сожалению, не удалось найти песни, игравшие вчера, в плейлисте.";
        }
      } else if (lowerCaseUserMessage.includes("сейчас играет") || lowerCaseUserMessage.includes("что сейчас")) {
          // Для "сейчас играет" вам понадобится более сложная логика, которая отслеживает текущее время
          // и ищет песню, которая должна играть в данный момент. Это выходит за рамки простого поиска по таблице
          // и может потребовать интеграции с системой вещания или более точного расписания.
          // В этом примере мы просто сообщим, что не можем дать точный ответ на "сейчас играет".
          responseFromPlaylist = "Извините, я не могу дать информацию о том, что играет прямо сейчас, так как мой плейлист обновляется периодически.";
      }
      // Добавьте больше условий для разных запросов (например, "что играло сегодня в 10 утра?")

      console.log("➡️ Ответ из плейлиста:", responseFromPlaylist);
      return res.json({ reply: responseFromPlaylist });
    }

    // --- Обращение к GPT (если не нашли ответ в прайсе или плейлисте) ---
    const messages = [
      {
        role: "system",
        content: `Ты — виртуальный агент RuWave 94FM, единственной русскоязычной радиостанции в Турции (Аланья, Газипаша, Манавгат), вещающей на частоте 94.6 FM и онлайн через ruwave.net, ruwave.net.tr и myradio24.com/ruwave.

        🎙️ Ты — голос эфира и креативный мозг: энергичный ведущий, знающий весь плейлист и расписание программ, и креативный директор с 25-летним опытом в рекламе (Cannes Lions, Clio, Effie, Red Apple).

        🎧 ТВОИ РЕСУРСЫ:
        • Instagram: @ruwave_alanya
        • У тебя есть доступ к актуальному плейлисту радио. Если пользователь спрашивает о песне, ты можешь предоставить информацию из него. (Обратите внимание: эта строка просто информирует GPT, но реальный поиск вы делаете выше)

        🧠 Ты умеешь:
        • Отвечать: «Какая песня сейчас играет?», «Что было в 22:30 вчера?», «Что за программа “Экспресс в прошлое”?», «Сколько стоит реклама на RuWave?»
        • Отвечать на русском или турецком — в зависимости от языка запроса

        🎨 Как креативный директор:
        • Отвечаешь на вопрос какая песня была, используя данные плейлиста.
        • Придумываешь рекламные тексты: инфо, диалоги, имидж
        • Предлагаешь форматы: джинглы, спонсорство, вставки
        • Объясняешь выгоды:
          - Единственное русское радио в регионе
          - Вещание 24/7 FM + Онлайн
          - Прямая связь с аудиторией
          - Цены: от €4 до €9.40 / 30 выходов, скидки от бюджета, надбавки за позицию
          - Спонсорство: от €400/мес, прямые упоминания и ролики
        `,
      },
      {
        role: "user",
        content: userMessage,
      },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages,
      max_tokens: 500,
      temperature: 0.7,
    });

    const reply =
      completion?.choices?.[0]?.message?.content ||
      "⚠️ Ошибка получения ответа от модели.";
    console.log("➡️ Ответ от GPT:", reply);
    res.json({ reply });
  } catch (err) {
    console.error("❌ Ошибка в /chat:", {
      message: err.message,
      stack: err.stack,
    });
    res.status(500).json({ error: "Ошибка сервера", detail: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`✅ RuWave сервер запущен на порту ${PORT}`)
);
