import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";

let server;
let baseUrl;
let output = "";

async function reservePort() {
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  const port = address.port;
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  return port;
}

before(async () => {
  const port = await reservePort();
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["src/index.js"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), AGENT_API_TOKEN: "test-agent-token", OPENAI_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  server.stdout.setEncoding("utf8");
  server.stderr.setEncoding("utf8");
  server.stdout.on("data", chunk => { output = (output + chunk).slice(-8000); });
  server.stderr.on("data", chunk => { output = (output + chunk).slice(-8000); });

  let ready = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (server.exitCode !== null) break;
    try {
      const response = await fetch(baseUrl + "/health", { signal: AbortSignal.timeout(500) });
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, `Backend did not start. Output: ${output}`);
});

after(async () => {
  if (!server || server.exitCode !== null) return;
  server.kill("SIGTERM");
  await Promise.race([
    once(server, "exit"),
    new Promise(resolve => setTimeout(resolve, 3000))
  ]);
  if (server.exitCode === null) server.kill("SIGKILL");
});

test("health endpoint reports service without exposing secrets", async () => {
  const response = await fetch(baseUrl + "/health");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    service: "personal-ai-agent",
    aiConfigured: false
  });
});

test("chat endpoint rejects requests without bearer token", async () => {
  const response = await fetch(baseUrl + "/v1/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "test" })
  });
  assert.equal(response.status, 401);
  assert.equal(typeof (await response.json()).error, "string");
});

test("chat endpoint rejects an incorrect bearer token", async () => {
  const response = await fetch(baseUrl + "/v1/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer wrong-token"
    },
    body: JSON.stringify({ message: "test" })
  });
  assert.equal(response.status, 401);
});

test("chat endpoint validates the required message field", async () => {
  const response = await fetch(baseUrl + "/v1/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-agent-token"
    },
    body: JSON.stringify({ message: "   " })
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /message/i);
});

test("chat endpoint reports missing model credentials as service unavailable", async () => {
  const response = await fetch(baseUrl + "/v1/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-agent-token"
    },
    body: JSON.stringify({ message: "test" })
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /OPENAI_API_KEY/);
});

test("malformed JSON receives a controlled client error", async () => {
  const response = await fetch(baseUrl + "/v1/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-agent-token"
    },
    body: "{ invalid json"
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /JSON/i);
});


test("voice endpoint requires bearer token", async () => {
  const response = await fetch(baseUrl + "/v1/voice", { method: "POST" });
  assert.equal(response.status, 401);
});

test("voice endpoint rejects a missing audio file", async () => {
  const response = await fetch(baseUrl + "/v1/voice", {
    method: "POST",
    headers: { authorization: "Bearer test-agent-token" },
    body: new FormData()
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /аудиофайл/i);
});

test("voice endpoint reports missing model credentials without calling external APIs", async () => {
  const form = new FormData();
  form.append("file", new Blob(["fake audio"], { type: "audio/wav" }), "voice.wav");
  form.append("history", "[]");
  const response = await fetch(baseUrl + "/v1/voice", {
    method: "POST",
    headers: { authorization: "Bearer test-agent-token" },
    body: form
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /OPENAI_API_KEY/);
});


test("voice endpoint rejects non-audio uploads", async () => {
  const form = new FormData();
  form.append("file", new Blob(["not audio"], { type: "text/plain" }), "notes.txt");
  const response = await fetch(baseUrl + "/v1/voice", {
    method: "POST",
    headers: { authorization: "Bearer test-agent-token" },
    body: form
  });
  assert.equal(response.status, 415);
  assert.match((await response.json()).error, /аудиофайлы/i);
});

test("voice endpoint rejects malformed conversation history", async () => {
  const form = new FormData();
  form.append("file", new Blob(["fake audio"], { type: "audio/wav" }), "voice.wav");
  form.append("history", "{broken");
  const response = await fetch(baseUrl + "/v1/voice", {
    method: "POST",
    headers: { authorization: "Bearer test-agent-token" },
    body: form
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /история/i);
});
