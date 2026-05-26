import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_PROFILE_ANALYSIS_BATCH_CHARS,
  batchProfileAnalysisDataUrls,
} from "./profile-analysis-batches.ts";

test("batches profile screenshots under the API request limit", () => {
  const a = "a".repeat(30);
  const b = "b".repeat(30);
  const c = "c".repeat(20);

  const result = batchProfileAnalysisDataUrls([a, b, c], {
    maxBatchChars: 55,
  });

  assert.deepEqual(result.batches, [[a], [b, c]]);
  assert.deepEqual(result.skippedOversizedIndexes, []);
});

test("skips a single profile screenshot that cannot fit in one safe request", () => {
  const tooLarge = "x".repeat(60);
  const ok = "ok";

  const result = batchProfileAnalysisDataUrls([tooLarge, ok], {
    maxBatchChars: 55,
  });

  assert.deepEqual(result.batches, [[ok]]);
  assert.deepEqual(result.skippedOversizedIndexes, [0]);
});

test("uses a conservative batch limit below the current API JSON limit", () => {
  assert.ok(MAX_PROFILE_ANALYSIS_BATCH_CHARS < 25_000_000);
});
