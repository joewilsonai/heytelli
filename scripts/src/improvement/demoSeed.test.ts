import assert from "node:assert/strict";
import test from "node:test";

import { buildDemoSeedDigest, buildDemoSeedPlan } from "./demoSeed";

test("demo seed plan covers the feedback-to-feature outcomes", () => {
  const plan = buildDemoSeedPlan();

  assert.equal(plan.length, 4);
  assert.deepEqual(
    plan.map((item) => item.outcome),
    ["already_available", "not_planned", "needs_more_signal", "actionable"],
  );
  assert.equal(
    plan.some((item) => item.workItem.decisionCategory === "already_available"),
    true,
  );
  assert.equal(
    plan.some((item) => item.workItem.decisionCategory === "not_planned"),
    true,
  );
  assert.equal(plan.some((item) => item.workItem.status === "planned"), true);
  assert.doesNotMatch(JSON.stringify(plan), /raw conversation|screenshot|phone|token/i);
});

test("demo seed digest is safe to paste into a demo run", () => {
  const digest = buildDemoSeedDigest({ dryRun: true, planned: buildDemoSeedPlan() });

  assert.match(digest, /Mode: dry run/);
  assert.match(digest, /Synthetic scenarios: 4/);
  assert.match(digest, /already_available/);
  assert.match(digest, /needs_more_signal/);
  assert.doesNotMatch(digest, /rawPayload|screenshot|transcript|token/i);
});
