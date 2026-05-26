import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath, URL as NodeURL } from "node:url";

const chatScreen = readFileSync(
  fileURLToPath(new NodeURL("../app/chat/[id].tsx", import.meta.url)),
  "utf8",
);

test("chat message streaming uses the shared API base URL", () => {
  assert.match(chatScreen, /getApiBaseUrl/);
  assert.doesNotMatch(chatScreen, /EXPO_PUBLIC_DOMAIN/);
  assert.doesNotMatch(chatScreen, /https:\/\/\$\{DOMAIN\}/);
});
