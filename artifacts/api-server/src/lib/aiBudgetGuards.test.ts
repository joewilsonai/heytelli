import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getModelCallsDisabledFallback,
  isModelCallsDisabled,
  shouldSkipNoNewEvidenceAnalysis,
} from "./aiBudgetGuards";

test("detects emergency model-call disable env values", () => {
  assert.equal(isModelCallsDisabled({ AI_MODEL_CALLS_DISABLED: "true" }), true);
  assert.equal(isModelCallsDisabled({ AI_MODEL_CALLS_DISABLED: "1" }), true);
  assert.equal(isModelCallsDisabled({ AI_MODEL_CALLS_DISABLED: "false" }), false);
  assert.equal(isModelCallsDisabled({}), false);
});

test("returns safe fallback copy when model calls are disabled", () => {
  assert.match(
    getModelCallsDisabledFallback(),
    /HeyTelli can't generate a new Calm Read right now/,
  );
});

test("skips analysis when there is no new evidence and fingerprints match", () => {
  assert.equal(
    shouldSkipNoNewEvidenceAnalysis({
      lastAnalysisFingerprint: "same",
      currentEvidenceFingerprint: "same",
      newEvidenceCount: 0,
    }),
    true,
  );
  assert.equal(
    shouldSkipNoNewEvidenceAnalysis({
      lastAnalysisFingerprint: "same",
      currentEvidenceFingerprint: "same",
      newEvidenceCount: 0,
      force: true,
    }),
    false,
  );
  assert.equal(
    shouldSkipNoNewEvidenceAnalysis({
      lastAnalysisFingerprint: "old",
      currentEvidenceFingerprint: "new",
      newEvidenceCount: 1,
    }),
    false,
  );
});
