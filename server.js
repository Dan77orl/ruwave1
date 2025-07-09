app.post("/chat", async (req, res) => {
  const userMessage = req.body.message?.trim();
  if (!userMessage) {
    return res.status(400).json({ error: "Пустое сообщение" });
  }

  // Проверка цен
  for (let key in prices) {
    if (userMessage.toLowerCase().includes(key)) {
      const reply = `Стоимость услуги "${key}": ${prices[key]}`;
      return res.json({ reply });
    }
  }

  // ✅ Новый и улучшенный парсинг запроса вида "что играло в [время] [дата]"
  const regex = /(?:в\s*)?(\d{1,2}[:.]\d{2})\s*(?:в\s*)?(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})?/i;
  const match = userMessage.match(regex);

  if (match) {
    const inputTime = match[1].replace(".", ":");
    const [h, m] = inputTime.split(":");
    const time = `${parseInt(h)}:${m}`; // Преобразует 09:00 → 9:00

    const date = match[2]
      ? dayjs(match[2], ["DD.MM.YYYY", "DD/MM/YYYY", "DD-MM-YYYY"]).format("DD.MM.YYYY")
      : dayjs().format("DD.MM.YYYY");

    try {
      const songs = await fetchSongs();
      const song = songs.find((row) => {
        const songDate = row["Дата"]?.trim();
        const songTime = row["Время"]?.trim();
        return songDate === date && songTime === time;
      });

      if (song) {
        return res.json({
          reply: `🎶 В ${time} (${date}) играла песня: ${song["Песня"]}`
        });
      } else {
        return res.json({
          reply: `🤷 Не нашёл песню на ${time} ${date}`
        });
      }
    } catch (err) {
      console.error("Ошибка загрузки песен:", err);
      return res.status(500).json({ error: "Ошибка чтения таблицы" });
    }
  }

  // Если не песня и не цена — отправляем в OpenAI
  const messages = [
    {
      role: "system",
      content: `Ты — виртуальный агент RuWave 94FM, энергичный креативный ассистент с опытом в радио и рекламе. Ты можешь придумывать рекламные тексты, отвечать на вопросы о радио, услугах, программе и музыке. Всю нужную инфу можешь найти здесь https://ruwave.net/. Отвечай коротко но качественно. Длинна сообщении максимум 160 символов. Цены: от €4 до €9.40 / 30 выходов, скидки от бюджета, надбавки за позицию`
    },
    { role: "user", content: userMessage }
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages,
      max_tokens: 500,
      temperature: 0.7
    });

    const reply = completion.choices?.[0]?.message?.content || "⚠️ Не получил ответ от GPT";
    res.json({ reply });
  } catch (err) {
    console.error("OpenAI ошибка:", err);
    res.status(500).json({ error: "Ошибка GPT", detail: err.message });
  }
});
