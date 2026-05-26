import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgres://heytelli:heytelli@127.0.0.1:1/heytelli";
process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ??= "http://127.0.0.1:1/openai";
process.env.AI_INTEGRATIONS_OPENAI_API_KEY ??= "test-openai-key";
process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL ??= "http://127.0.0.1:1/openrouter";
process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY ??= "test-openrouter-key";

test("marks analyzed profile-only screenshots as current even without transcript", async () => {
  const { computeFreshness } = await import("./matches");

  const result = computeFreshness(0, [{ extractionStatus: "done" }]);

  assert.deepEqual(result, {
    pendingScreenshotCount: 0,
    failedScreenshotCount: 0,
    analysisFreshness: "current",
  });
});

test("keeps the prior analysis current-but-stale when newer screenshots are pending", async () => {
  const { computeFreshness } = await import("./matches");

  const result = computeFreshness(3, [
    { extractionStatus: "done" },
    { extractionStatus: "pending" },
  ]);

  assert.deepEqual(result, {
    pendingScreenshotCount: 1,
    failedScreenshotCount: 0,
    analysisFreshness: "needs-analysis",
  });
});
