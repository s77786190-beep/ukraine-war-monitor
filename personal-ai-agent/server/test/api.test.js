import { spawn } from "node:child_process";
import { once } from "node:events";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";

const port = 18000 + Math.floor(Math.random() * 20000);
const baseUrl = `http://127.0.0.1:${port}`;
let server;

before(async () => {
  server = spawn(process.execPath, ["src/index.js"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PORT: String(port), AGENT_API_TOKEN: "test-token", OPENAI_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let lastError;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) throw new Error("Test server exited before becoming ready");
    try {
      const response = await fetch(baseUrl + "/health");
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Test server did not become ready: " + String(lastError));
});

after(async () => {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([once(server, "exit"), new Promise(resolve => setTimeout(resolve, 2000))]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
});

test("health endpoint reports service status without exposing secrets", async () => {
  const response = await fetch(baseUrl + "/health");
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.service, "personal-ai-agent");
  assert.equal(body.aiConfigured, false);
  assert.equal("apiToken" in body, false);
});

test("chat rejects missing authorization", async () => {
  const response = await fetch(baseUrl + "/v1/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "test" })
  });
  assert.equal(response.status, 401);
});

test("chat rejects an invalid bearer token", async () => {
  const response = await fetch(baseUrl + "/v1/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer wrong-token" },
    body: JSON.stringify({ message: "test" })
  });
  assert.equal(response.status, 401);
});

test("chat reports missing model API key after successful authentication", async () => {
  const response = await fetch(baseUrl + "/v1/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
    body: JSON.stringify({ message: "test" })
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /OPENAI_API_KEY/);
});

test("chat rejects empty messages before requiring model configuration", async () => {
  const response = await fetch(baseUrl + "/v1/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
    body: JSON.stringify({ message: " " })
  });
  assert.equal(response.status, 400);
});
