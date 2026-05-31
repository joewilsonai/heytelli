import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "../../../..");

test("AI usage summary route is admin-only and mounted", () => {
  const route = readFileSync(
    path.join(root, "artifacts/api-server/src/routes/aiUsage.ts"),
    "utf8",
  );
  const index = readFileSync(
    path.join(root, "artifacts/api-server/src/routes/index.ts"),
    "utf8",
  );

  assert.match(route, /\/admin\/ai-usage\/summary/);
  assert.match(route, /requireAdmin/);
  assert.match(index, /aiUsageRouter/);
});
