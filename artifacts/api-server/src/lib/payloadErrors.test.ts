import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const appPath = path.resolve(import.meta.dirname, "../app.ts");

test("API returns JSON guidance when profile screenshot payloads are too large", async () => {
  const app = await readFile(appPath, "utf8");

  assert.match(app, /PayloadTooLargeError/);
  assert.match(app, /profile screenshots are too large/i);
  assert.match(app, /status\(413\)\.json/);
});
