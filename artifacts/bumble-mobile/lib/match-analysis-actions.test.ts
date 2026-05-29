import assert from "node:assert/strict";
import test from "node:test";

import { getMatchAnalysisActionPlan } from "./match-analysis-actions.ts";

const baseMatch = {
  screenshots: [{}],
  pendingScreenshotCount: 0,
  failedScreenshotCount: 0,
  analysisFreshness: "current",
  readFreshness: "current",
  dateBriefFreshness: "current",
  nextDateAt: null,
};

test("shows Analyze new for waiting screenshots and updates read and patterns together", () => {
  const plan = getMatchAnalysisActionPlan({
    ...baseMatch,
    pendingScreenshotCount: 2,
    analysisFreshness: "needs-analysis",
    readFreshness: "stale",
  });

  assert.equal(plan.visible, true);
  assert.equal(plan.label, "Analyze new");
  assert.deepEqual(plan.actions, ["read", "patterns"]);
  assert.match(plan.body, /latest read/);
  assert.match(plan.body, /patterns/);
});

test("includes date brief when pending screenshots will make an upcoming date brief stale", () => {
  const plan = getMatchAnalysisActionPlan(
    {
      ...baseMatch,
      pendingScreenshotCount: 1,
      analysisFreshness: "needs-analysis",
      readFreshness: "stale",
      dateBriefFreshness: "current",
      nextDateAt: "2026-06-02T00:00:00.000Z",
    },
    new Date("2026-05-29T12:00:00.000Z"),
  );

  assert.deepEqual(plan.actions, ["read", "patterns", "dateBrief"]);
  assert.match(plan.body, /date brief/);
});

test("stays hidden when there are no screenshots to analyze", () => {
  const plan = getMatchAnalysisActionPlan({
    ...baseMatch,
    screenshots: [],
    analysisFreshness: "never-analyzed",
    readFreshness: "missing",
  });

  assert.equal(plan.visible, false);
});
