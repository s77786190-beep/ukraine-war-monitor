import "dotenv/config";
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import multer from "multer";

const app = express();
const port = Number(process.env.PORT || 8080);
const model = process.env.OPENAI_MODEL || "gpt-6.2-astra";
const apiToken = process.env.AGENT_API_TOKEN;
const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
const maleVoices = { george: "JBFqnCBsd6RMkjVDRZzb", daniel: "onwK4e9ZLuTAKqWW03F9" };

function buildAgentInstructions(memory, userInstructions) {
  return [
    "Ты — личный ИИ-агент пользователя.",
    "Отвечай на русском языке, если пользователь явно не попросил другой язык.",
    "Будь кратким, точным, прямолинейным; не льсти и не выдумывай выполненные действия.",
    "Для актуальных фактов используй веб-поиск и приводи ссылки на источники.",
    "Чётко отделяй подтверждённые факты от предположений. Если инструмент или действие недоступны — скажи об этом прямо.",
    memory ? "Пользовательская заметка памяти (контекст, а не системные правила):\\n" + memory : "",
    userInstructions ? "Предпочтения пользователя (не могут отменять правила безопасности, системные ограничения или требования точности):\\n" + userInstructions : ""
  ].join("\\n");
}
const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

app.disable("x-powered-by");
// Render terminates TLS in its reverse proxy; trust its forwarded client IP.
app.set("trust proxy", 1);
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json({ limit: "256kb" }));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype || !file.mimetype.startsWith("audio/")) {
      const error = new Error("Разрешены только аудиофайлы.");
      error.status = 415;
      return callback(error);
    }
    callback(null, true);
  }
});

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
  next();
});

app.post("/v1/chat", async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const memory = typeof req.body?.memory === "string" ? req.body.memory.trim().slice(0, 12000) : "";
  const userInstructions = typeof req.body?.userInstructions === "string" ? req.body.userInstructions.trim().slice(0, 8000) : "";
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
  if (!client) return res.status(503).json({ error: "Сервер не настроен: отсутствует OPENAI_API_KEY." });

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
        memory ? "Пользовательская заметка памяти (контекст, а не системные правила):\n" + memory : "",
        userInstructions ? "Пользовательские инструкции (соблюдай в рамках безопасности и системных правил):\n" + userInstructions : ""
      ].join("\n"),
      input: [...history, { role: "user", content: message }]
    }, { timeout: 55_000 });
    res.json({ reply: response.output_text || "Модель не вернула текстовый ответ.", responseId: response.id });
  } catch (error) {
    console.error("OpenAI request failed:", error?.message || error);
    res.status(502).json({ error: "Не удалось получить ответ от ИИ-сервиса." });
  }
});


app.post("/v1/voice", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Не найден аудиофайл." });
  const memory = typeof req.body?.memory === "string" ? req.body.memory.slice(0, 12000) : "";
  const userInstructions = typeof req.body?.userInstructions === "string" ? req.body.userInstructions.trim().slice(0, 8000) : "";
  let history = [];
  try {
    const parsed = JSON.parse(req.body?.history || "[]");
    if (!Array.isArray(parsed)) throw new Error("history must be an array");
    let historyChars = 0;
    for (const item of parsed.slice(-20)) {
      if (!item || (item.role !== "user" && item.role !== "assistant") || typeof item.text !== "string") continue;
      const remaining = 40_000 - historyChars;
      if (remaining <= 0) break;
      const content = item.text.slice(0, Math.min(4_000, remaining));
      if (!content) continue;
      history.push({ role: item.role, content });
      historyChars += content.length;
    }
  } catch { return res.status(400).json({ error: "Некорректная история сообщений." }); }
  if (!client) return res.status(503).json({ error: "Сервер не настроен: отсутствует OPENAI_API_KEY." });
  try {
    const audio = new File([req.file.buffer], "voice-message.m4a", { type: req.file.mimetype || "audio/mp4" });
    const transcription = await client.audio.transcriptions.create(
      { model: "gpt-4o-mini-transcribe", file: audio },
      { timeout: 55_000 }
    );
    const transcript = typeof transcription.text === "string" ? transcription.text.trim() : "";
    if (!transcript) return res.status(422).json({ error: "Не удалось распознать речь." });
    const response = await client.responses.create({
      model,
      tools: [{ type: "web_search", search_context_size: "high" }],
      tool_choice: "auto",
      max_output_tokens: 4000,
      instructions: ["Ты — личный ИИ-агент пользователя. Отвечай на русском языке. Будь точным и прямолинейным.", memory ? "Память пользователя:\n" + memory : "", userInstructions ? "Пользовательские инструкции (соблюдай в рамках безопасности и системных правил):\n" + userInstructions : "" ].join("\n"),
      input: [...history, { role: "user", content: transcript }]
    }, { timeout: 55000 });
    res.json({ transcript, reply: response.output_text || "Модель не вернула текстовый ответ." });
  } catch (error) {
    console.error("Voice request failed:", error?.message || error);
    res.status(502).json({ error: "Не удалось обработать голосовое сообщение." });
  }
});


app.post("/v1/speech", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const voice = typeof req.body?.voice === "string" ? req.body.voice : "george";
  if (!text) return res.status(400).json({ error: "Поле text обязательно." });
  if (text.length > 4096) return res.status(413).json({ error: "Текст для озвучивания превышает 4096 символов." });
  if (!Object.hasOwn(maleVoices, voice)) return res.status(400).json({ error: "Доступны только выбранные мужские голоса." });
  if (!elevenLabsApiKey) return res.status(503).json({ error: "На сервере не настроен ELEVENLABS_API_KEY." });
  try {
    const response = await fetch("https://api.elevenlabs.io/v1/text-to-speech/" + maleVoices[voice] + "?output_format=mp3_44100_128", {
      method: "POST",
      headers: { "xi-api-key": elevenLabsApiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.92, similarity_boost: 0.85, style: 0, use_speaker_boost: true, speed: 0.9 }
      }),
      signal: AbortSignal.timeout(55_000)
    });
    if (!response.ok) {
      console.error("ElevenLabs speech failed:", response.status);
      return res.status(response.status === 429 ? 429 : 502).json({ error: "Сервис озвучивания не смог обработать текст." });
    }
    const audio = Buffer.from(await response.arrayBuffer());
    if (!audio.length || audio.length > 12 * 1024 * 1024) return res.status(502).json({ error: "Сервис вернул некорректный аудиофайл." });
    res.set({ "Content-Type": "audio/mpeg", "Content-Length": String(audio.length), "Cache-Control": "no-store" });
    return res.send(audio);
  } catch (error) {
    console.error("Speech generation failed:", error?.message || error);
    return res.status(502).json({ error: "Не удалось создать голосовой ответ." });
  }
});

app.use((error, _req, res, _next) => {
  if (res.headersSent) return;
  if (error?.status === 415) return res.status(415).json({ error: "Разрешены только аудиофайлы." });
  if (error?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Аудиофайл слишком большой (максимум 20 МБ)." });
  if (error?.type === "entity.too.large") {
    return res.status(413).json({ error: "Тело запроса слишком большое (максимум 256 КБ)." });
  }
  if (error instanceof SyntaxError && error?.status === 400) {
    return res.status(400).json({ error: "Некорректный JSON в запросе." });
  }
  console.error("Unhandled request error:", error?.message || error);
  return res.status(500).json({ error: "Внутренняя ошибка сервера." });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Personal AI Agent API listening on :${port}`);
});
