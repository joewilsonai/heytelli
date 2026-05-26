import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const matchesRoute = readFileSync(
  new URL("./matches.ts", import.meta.url),
  "utf8",
);
const chatRoute = readFileSync(new URL("./chat.ts", import.meta.url), "utf8");
const storageRoute = readFileSync(
  new URL("./storage.ts", import.meta.url),
  "utf8",
);

test("matches routes require auth and scope reads/writes by user", () => {
  assert.match(matchesRoute, /requireAuth/);
  assert.match(matchesRoute, /requireUserId\(req\)/);
  assert.match(matchesRoute, /loadMatchDetail\([^)]*userId/);
  assert.match(matchesRoute, /eq\(matches\.userId,\s*userId\)/);
  assert.match(matchesRoute, /insert\(matches\)[\s\S]*userId/);
  assert.match(matchesRoute, /deleteMatchAndHistory\(db,[\s\S]*userId/);
});

test("chat routes keep conversations and prompts inside the active user tenant", () => {
  assert.match(chatRoute, /requireAuth/);
  assert.match(chatRoute, /requireUserId\(req\)/);
  assert.match(chatRoute, /buildSystemPrompt\([^)]*userId/);
  assert.match(chatRoute, /eq\(conversations\.userId,\s*userId\)/);
  assert.match(chatRoute, /eq\(matches\.userId,\s*userId\)/);
  assert.match(chatRoute, /insert\(conversations\)[\s\S]*userId/);
});

test("private object routes require auth and verify object ownership", () => {
  assert.match(storageRoute, /requireAuth/);
  assert.match(storageRoute, /assertObjectBelongsToUser/);
  assert.match(storageRoute, /eq\(matches\.userId,\s*userId\)/);
});
