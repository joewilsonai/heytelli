import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "../../../..");

test("product-facing chat surfaces are HeyTelli-branded", async () => {
  const files = [
    "lib/api-spec/openapi.yaml",
    "artifacts/api-server/src/routes/chat.ts",
    "artifacts/bumble-mobile/app/chat/[id].tsx",
    "artifacts/bumble-mobile/app/chat/index.tsx",
    "artifacts/bumble-mobile/app/match/[id].tsx",
    "artifacts/bumble-reply/src/pages/Chat.tsx",
    "artifacts/bumble-reply/src/pages/MatchDetail.tsx",
  ];

  for (const file of files) {
    const body = await readFile(path.join(root, file), "utf8");
    assert.doesNotMatch(body, /\bGrok\b|\bWingman\b|openrouter/i, file);
  }
});
