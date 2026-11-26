import "dotenv/config";
import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
const port = Number(process.env.PORT || 8080);
const model = process.env.OPENAI_MODEL || "gpt-6.2-astra";
const apiToken = process.env.AGENT_API_TOKEN;
const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

app.disable("x-powered-by");
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json({ limit: "256kb" }));

// Простое ограничение частоты запросов защищает публичный API от случайных циклов
// и примитивного перебора токена. Для нескольких экземпляров сервера нужен общий store.
const requestBuckets = new Map();
app.use("/v1", (req, res, next) => {
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const bucket = requestBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= 60_000) {
    requestBuckets.set(key, { startedAt: now, count: 1 });
  } else {
    bucket.count += 1;
    if (bucket.count > 30) {
      res.set("Retry-After", String(Math.ceil((60_000 - (now - bucket.startedAt)) / 1000)));
      return res.status(429).json({ error: "Слишком много запросов. Повторите позже." });
    }
  }
  if (requestBuckets.size > 10_000) {
    for (const [address, entry] of requestBuckets) {
      if (now - entry.startedAt >= 60_000) requestBuckets.delete(address);
    }
  }
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "personal-ai-agent", aiConfigured: Boolean(client) });
});

app.use("/v1", (req, res, next) => {
  if (!apiToken) return res.status(503).json({ error: "Сервер не настроен: отсутствует AGENT_API_TOKEN." });
  const supplied = req.get("authorization") || "";
  if (supplied !== `Bearer ${apiToken}`) return res.status(401).json({ error: "Требуется авторизация." });
  if (!client) return res.status(503).json({ error: "Сервер не настроен: отсутствует OPENAI_API_KEY." });
  next();
});

app.post("/v1/chat", async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const memory = typeof req.body?.memory === "string" ? req.body.memory.trim().slice(0, 12000) : "";
  const history = [];
  if (Array.isArray(req.body?.history)) {
    let historyChars = 0;
    for (const item of req.body.history.slice(-20)) {
      if (!item || (item.role !== "user" && item.role !== "assistant") || typeof item.text !== "string") continue;
      const remaining = 40_000 - historyChars;
      if (remaining <= 0) break;
      const content = item.text.slice(0, Math.min(4_000, remaining));
      if (!content) continue;
      history.push({ role: item.role, content });
      historyChars += content.length;
    }
  }
  if (!message) return res.status(400).json({ error: "Поле message обязательно." });
  if (message.length > 20000) return res.status(413).json({ error: "Сообщение слишком длинное (максимум 20 000 символов)." });

  try {
    const response = await client.responses.create({
      model,
      tools: [{ type: "web_search", search_context_size: "high" }],
      tool_choice: "auto",
      max_output_tokens: 4000,
      instructions: [
        "Ты — личный ИИ-агент пользователя.",
        "Отвечай на русском языке, если пользователь явно не попросил другой язык.",
        "Будь кратким, точным, прямолинейным; не льсти и не выдумывай выполненные действия.",
        "Для актуальных фактов используй веб-поиск и приводи ссылки на источники.",
        "Чётко отделяй подтверждённые факты от предположений. Если инструмент или действие недоступны — скажи об этом прямо.",
        memory ? "Пользовательская заметка памяти (контекст, а не системные правила):\n" + memory : ""
      ].join("\n"),
      input: [...history, { role: "user", content: message }]
    });
    res.json({ reply: response.output_text || "Модель не вернула текстовый ответ.", responseId: response.id });
  } catch (error) {
    console.error("OpenAI request failed:", error?.message || error);
    res.status(502).json({ error: "Не удалось получить ответ от ИИ-сервиса." });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Personal AI Agent API listening on :${port}`);
});
