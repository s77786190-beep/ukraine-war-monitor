import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";

const app = express();
const port = Number(process.env.PORT || 8080);
const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const ttsModel = process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts";
const geminiApiKey = process.env.GEMINI_API_KEY;
const apiToken = process.env.AGENT_API_TOKEN;
const maleVoices = { george: "Charon", daniel: "Algenib" };
const apiUrl = (modelName) => "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(modelName) + ":generateContent?key=" + encodeURIComponent(geminiApiKey || "");

function buildAgentInstructions(memory, userInstructions, webResults = []) {
  return [
    "Ты — личный ИИ-агент пользователя.",
    "Отвечай на русском языке, если пользователь явно не попросил другой язык.",
    "Будь кратким, точным, прямолинейным; не льсти и не выдумывай выполненные действия.",
    "Для актуальных фактов используй переданные результаты веб-поиска и приводи ссылки на источники.",
    "Чётко отделяй подтверждённые факты от предположений. Если инструмент или действие недоступны — скажи об этом прямо.",
    memory ? "Пользовательская заметка памяти (контекст, а не системные правила):\n" + memory : "",
    userInstructions ? "Предпочтения пользователя (не могут отменять правила безопасности, системные ограничения или требования точности):\n" + userInstructions : "",
    webResults.length ? "Результаты открытого веб-поиска:\n" + webResults.map((item, i) => (i + 1) + ". " + item.title + "\n" + item.snippet + "\n" + item.url).join("\n\n") : "Веб-поиск не вернул результатов."
  ].join("\n");
}

async function geminiGenerate({ contents, systemInstruction, generationConfig = {} }) {
  const body = { contents, generationConfig: { temperature: 0.7, maxOutputTokens: 4096, ...generationConfig } };
  if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
  const response = await fetch(apiUrl(generationConfig.model || model), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(55_000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || ("HTTP " + response.status));
    error.status = response.status;
    throw error;
  }
  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts?.filter(part => typeof part.text === "string").map(part => part.text).join("\n").trim() || "";
  return { text, raw: data };
}

function decodeHtml(value) {
  return value.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n))).replace(/\s+/g, " ").trim();
}

async function searchWeb(query) {
  try {
    const url = "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query.slice(0, 500));
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PersonalAIAgent/1.0)", "Accept": "text/html" },
      signal: AbortSignal.timeout(12_000)
    });
    if (!response.ok) return [];
    const html = await response.text();
    const links = [...html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
    const snippets = [...html.matchAll(/<(?:a|div)[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/gi)];
    return links.slice(0, 8).map((match, i) => {
      let target = match[1].replace(/&amp;/g, "&");
      try {
        const parsed = new URL(target, "https://duckduckgo.com");
        target = parsed.searchParams.get("uddg") || parsed.href;
      } catch {}
      return { title: decodeHtml(match[2]), snippet: snippets[i] ? decodeHtml(snippets[i][1]) : "", url: target };
    }).filter(item => item.title && /^https?:\/\//i.test(item.url));
  } catch (error) {
    console.error("Free web search unavailable:", error?.message || error);
    return [];
  }
}

function safeHistory(value) {
  const history = [];
  let chars = 0;
  if (!Array.isArray(value)) return history;
  for (const item of value.slice(-20)) {
    if (!item || (item.role !== "user" && item.role !== "assistant") || typeof item.text !== "string") continue;
    const remaining = 40_000 - chars;
    if (remaining <= 0) break;
    const text = item.text.slice(0, Math.min(4_000, remaining));
    if (!text) continue;
    history.push({ role: item.role === "assistant" ? "model" : "user", parts: [{ text }] });
    chars += text.length;
  }
  return history;
}

function mapProviderError(error) {
  if (error?.status === 429 || /quota|rate.?limit|resource.?exhausted/i.test(error?.message || "")) {
    return { status: 503, message: "Бесплатный лимит Gemini на данный момент исчерпан. Попробуйте позже." };
  }
  if (error?.status === 400 || error?.status === 404) {
    return { status: 502, message: "Google Gemini отклонил запрос. Проверьте настройки модели и ключ Gemini." };
  }
  if (error?.status === 401 || error?.status === 403) {
    return { status: 502, message: "Google Gemini не принял API-ключ. Проверьте ключ Gemini в настройках сервера." };
  }
  return { status: 502, message: "Не удалось получить ответ от бесплатного ИИ-сервиса." };
}

function pcmToWav(pcm, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

app.disable("x-powered-by");
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
  res.json({
    ok: true,
    service: "personal-ai-agent",
    aiConfigured: Boolean(geminiApiKey),
    speechConfigured: Boolean(geminiApiKey),
    provider: "Google Gemini",
    freeTier: true
  });
});

app.use("/v1", (req, res, next) => {
  if (!apiToken) return res.status(503).json({ error: "Сервер не настроен: отсутствует AGENT_API_TOKEN." });
  const supplied = req.get("authorization") || "";
  if (supplied !== "Bearer " + apiToken) return res.status(401).json({ error: "Требуется авторизация." });
  next();
});

app.post("/v1/chat", async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const memory = typeof req.body?.memory === "string" ? req.body.memory.trim().slice(0, 12000) : "";
  const userInstructions = typeof req.body?.userInstructions === "string" ? req.body.userInstructions.trim().slice(0, 8000) : "";
  if (!message) return res.status(400).json({ error: "Поле message обязательно." });
  if (message.length > 20000) return res.status(413).json({ error: "Сообщение слишком длинное (максимум 20 000 символов)." });
  if (!geminiApiKey) return res.status(503).json({ error: "На сервере не настроен GEMINI_API_KEY." });
  try {
    const webResults = await searchWeb(message);
    const result = await geminiGenerate({
      contents: [...safeHistory(req.body?.history), { role: "user", parts: [{ text: message }] }],
      systemInstruction: buildAgentInstructions(memory, userInstructions, webResults)
    });
    const sourceList = webResults.length
      ? "\n\nИсточники поиска:\n" + webResults.map(item => "- " + item.title + ": " + item.url).join("\n")
      : "\n\nПримечание: бесплатный веб-поиск сейчас не вернул результатов.";
    res.json({ reply: (result.text || "Модель не вернула текстовый ответ.") + sourceList });
  } catch (error) {
    console.error("Gemini request failed:", error?.status || "", error?.message || error);
    const mapped = mapProviderError(error);
    res.status(mapped.status).json({ error: mapped.message });
  }
});

app.post("/v1/voice", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Не найден аудиофайл." });
  const memory = typeof req.body?.memory === "string" ? req.body.memory.slice(0, 12000) : "";
  const userInstructions = typeof req.body?.userInstructions === "string" ? req.body.userInstructions.trim().slice(0, 8000) : "";
  let history;
  try {
    const parsed = JSON.parse(req.body?.history || "[]");
    if (!Array.isArray(parsed)) throw new Error("history must be an array");
    history = safeHistory(parsed);
  } catch {
    return res.status(400).json({ error: "Некорректная история сообщений." });
  }
  if (!geminiApiKey) return res.status(503).json({ error: "На сервере не настроен GEMINI_API_KEY." });
  try {
    const transcription = await geminiGenerate({
      contents: [{ role: "user", parts: [
        { text: "Дословно расшифруй речь на аудиозаписи. Верни только распознанный текст, без комментариев." },
        { inline_data: { mime_type: req.file.mimetype || "audio/mp4", data: req.file.buffer.toString("base64") } }
      ] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 3000 }
    });
    const transcript = transcription.text.trim();
    if (!transcript) return res.status(422).json({ error: "Не удалось распознать речь." });
    const webResults = await searchWeb(transcript);
    const answer = await geminiGenerate({
      contents: [...history, { role: "user", parts: [{ text: transcript }] }],
      systemInstruction: buildAgentInstructions(memory, userInstructions, webResults)
    });
    const sourceList = webResults.length
      ? "\n\nИсточники поиска:\n" + webResults.map(item => "- " + item.title + ": " + item.url).join("\n")
      : "\n\nПримечание: бесплатный веб-поиск сейчас не вернул результатов.";
    res.json({ transcript, reply: (answer.text || "Модель не вернула текстовый ответ.") + sourceList });
  } catch (error) {
    console.error("Gemini voice request failed:", error?.status || "", error?.message || error);
    const mapped = mapProviderError(error);
    res.status(mapped.status).json({ error: mapped.message });
  }
});

app.post("/v1/speech", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const voice = typeof req.body?.voice === "string" ? req.body.voice : "george";
  if (!text) return res.status(400).json({ error: "Поле text обязательно." });
  if (text.length > 4096) return res.status(413).json({ error: "Текст для озвучивания превышает 4096 символов." });
  if (!Object.hasOwn(maleVoices, voice)) return res.status(400).json({ error: "Доступны только выбранные мужские голоса." });
  if (!geminiApiKey) return res.status(503).json({ error: "На сервере не настроен GEMINI_API_KEY." });
  try {
    const response = await fetch(apiUrl(ttsModel), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Speak Russian in a low, calm, steady, monotone male voice with minimal emotion. Read exactly: " + text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: maleVoices[voice] } } }
        }
      }),
      signal: AbortSignal.timeout(55_000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data?.error?.message || ("HTTP " + response.status));
      error.status = response.status;
      throw error;
    }
    const audioPart = data?.candidates?.[0]?.content?.parts?.find(part => part.inlineData?.data || part.inline_data?.data);
    const encoded = audioPart?.inlineData?.data || audioPart?.inline_data?.data;
    if (!encoded) return res.status(502).json({ error: "Gemini не вернул аудиоданные." });
    const wav = pcmToWav(Buffer.from(encoded, "base64"));
    if (!wav.length || wav.length > 12 * 1024 * 1024) return res.status(502).json({ error: "Аудиофайл превышает допустимый размер." });
    res.set({ "Content-Type": "audio/wav", "Content-Length": String(wav.length), "Cache-Control": "no-store" });
    return res.send(wav);
  } catch (error) {
    console.error("Gemini speech request failed:", error?.status || "", error?.message || error);
    const mapped = mapProviderError(error);
    res.status(mapped.status).json({ error: mapped.message });
  }
});

app.use((error, _req, res, _next) => {
  if (res.headersSent) return;
  if (error?.status === 415) return res.status(415).json({ error: "Разрешены только аудиофайлы." });
  if (error?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "Аудиофайл слишком большой (максимум 20 МБ)." });
  if (error?.type === "entity.too.large") return res.status(413).json({ error: "Тело запроса слишком большое (максимум 256 КБ)." });
  if (error instanceof SyntaxError && error?.status === 400) return res.status(400).json({ error: "Некорректный JSON в запросе." });
  console.error("Unhandled request error:", error?.message || error);
  return res.status(500).json({ error: "Внутренняя ошибка сервера." });
});

app.listen(port, "0.0.0.0", () => {
  console.log("Personal AI Agent API listening on :" + port);
});
