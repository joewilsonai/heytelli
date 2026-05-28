import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "../../../..");

test("match detail carries saved green flags and the overall radar read", async () => {
  const route = await readFile(
    path.join(root, "artifacts/api-server/src/routes/matches.ts"),
    "utf8",
  );

  const historyFunction = route.match(
    /function redFlagHistoryFromRows[\s\S]*?\n}\n\nasync function loadRedFlagEvents/,
  )?.[0];

  assert.ok(historyFunction, "redFlagHistoryFromRows should exist");
  assert.match(historyFunction, /greenFlags:/);
  assert.match(historyFunction, /overallRead:/);
});

test("screenshot rescore writes a timeline moment from the latest read", async () => {
  const route = await readFile(
    path.join(root, "artifacts/api-server/src/routes/matches.ts"),
    "utf8",
  );

  const rescoreRoute = route.match(
    /router\.post\("\/matches\/:id\/rescore"[\s\S]*?router\.post\(\s*"\//,
  )?.[0];

  assert.ok(rescoreRoute, "rescore route should exist");
  assert.match(rescoreRoute, /matchTimelineEvents/);
  assert.match(rescoreRoute, /type:\s*"screenshot_import"/);
  assert.match(rescoreRoute, /summary:\s*lastRead\.body/);
});
