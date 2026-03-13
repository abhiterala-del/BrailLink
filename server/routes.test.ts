import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { registerRoutes } from "./routes";

test("upload validation and missing configuration return useful errors without calling providers", async (t) => {
  const providerEnv = [
    "OCR_PROVIDER",
    "OCR_MODEL",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "TRANSCRIBE_API_KEY",
    "TRANSCRIBE_BASE_URL",
    "TRANSCRIBE_MODEL",
  ];
  const originalEnv = Object.fromEntries(providerEnv.map((name) => [name, process.env[name]]));
  for (const name of providerEnv) delete process.env[name];
  t.after(() => {
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  const server = registerRoutes(express());
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok" });

  for (const path of ["ocr", "transcribe"]) {
    const response = await fetch(`${base}/api/${path}`, { method: "POST" });
    assert.equal(response.status, 400);
  }
  for (const [path, field, type, status] of [
    ["ocr", "image", "text/plain", 400],
    ["ocr", "image", "image/png", 503],
    ["transcribe", "audio", "text/plain", 415],
    ["transcribe", "audio", "audio/webm", 503],
  ] as const) {
    const body = new FormData();
    body.append(field, new Blob(["test upload"], { type }), "sample");
    const response = await fetch(`${base}/api/${path}`, { method: "POST", body });
    assert.equal(response.status, status);
    assert.equal(typeof (await response.json()).message, "string");
  }

  const postImage = async (type: string) => {
    const body = new FormData();
    body.append("image", new Blob(["test upload"], { type }), "sample");
    return fetch(`${base}/api/ocr`, { method: "POST", body });
  };

  // An explicit provider without its key, or an unknown provider, is a configuration error
  process.env.OCR_PROVIDER = "anthropic";
  assert.equal((await postImage("image/png")).status, 503);
  process.env.OCR_PROVIDER = "not-a-provider";
  assert.equal((await postImage("image/png")).status, 503);
  process.env.OCR_PROVIDER = "constructor";
  assert.equal((await postImage("image/png")).status, 503);

  // Claude rejects image types it can't read before any request is made
  process.env.OCR_PROVIDER = "anthropic";
  process.env.ANTHROPIC_API_KEY = "test-key";
  assert.equal((await postImage("image/bmp")).status, 415);
});
