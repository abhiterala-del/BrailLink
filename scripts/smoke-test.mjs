import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

// Run after building. No provider calls or physical print jobs are sent.
const probe = createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const child = spawn(process.execPath, ["dist/index.js"], {
  env: { ...process.env, NODE_ENV: "production", PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });
let launchError;
child.on("error", (error) => { launchError = error; });
const base = `http://127.0.0.1:${port}`;

try {
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (launchError) throw launchError;
    if (child.exitCode !== null) throw new Error(`Server exited: ${output}`);
    try {
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: "ok" });
      ready = true;
      break;
    } catch {
      await delay(100);
    }
  }
  assert.ok(ready, `Production server did not become ready: ${output}`);
  const home = await fetch(base);
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /<title>BraiLink<\/title>/);
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)];
  assert.ok(assets.length >= 2, "Expected built JavaScript and CSS");
  for (const [, asset] of assets) {
    const response = await fetch(`${base}${asset}`);
    assert.equal(response.status, 200, asset);
    assert.doesNotMatch(response.headers.get("content-type") || "", /text\/html/);
  }
  assert.equal((await fetch(`${base}/client-side-route`)).status, 200);
  const missing = await fetch(`${base}/api/not-found`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { message: "API endpoint not found" });
  for (const endpoint of ["ocr", "transcribe"]) {
    const response = await fetch(`${base}/api/${endpoint}`, { method: "POST" });
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).message, "string");
  }
  const malformed = await fetch(`${base}/api/ocr`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
  });
  assert.equal(malformed.status, 400);
  assert.equal(typeof (await malformed.json()).message, "string");
  console.log("Production smoke test passed: startup, health, HTML, assets, routing, and API validation.");
} finally {
  if (child.exitCode === null && !launchError) {
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    const forceKill = setTimeout(() => child.kill("SIGKILL"), 2000);
    await exited;
    clearTimeout(forceKill);
  }
}
