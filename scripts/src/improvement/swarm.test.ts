import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSwarmPlan,
  canAutoMergeSwarmPlan,
  issueLabelsAllowSwarmPlanning,
} from "./swarmPlan";

test("maps low-risk copy work to a safe autonomous swarm", () => {
  const plan = buildSwarmPlan({
    category: "copy",
    priority: "p3",
    riskTier: "safe_auto_merge",
    privacyRisk: "low",
    labels: [
      "feedback",
      "copy",
      "priority:p3",
      "risk:safe_auto_merge",
      "agent-ready",
    ],
  });

  assert.equal(plan.riskTier, "safe_auto_merge");
  assert.deepEqual(plan.requiredAgentRoles, [
    "researcher",
    "builder",
    "code_reviewer",
  ]);
  assert.equal(plan.autoMergePolicy.mode, "auto_merge_after_checks");
  assert.equal(canAutoMergeSwarmPlan(plan), true);
});

test("requires specialist review for guarded product bugs", () => {
  const plan = buildSwarmPlan({
    category: "bug",
    priority: "p2",
    riskTier: "guarded_auto_merge",
    privacyRisk: "low",
    labels: [
      "feedback",
      "bug",
      "priority:p2",
      "risk:guarded_auto_merge",
      "agent-ready",
    ],
  });

  assert.equal(plan.riskTier, "guarded_auto_merge");
  assert.deepEqual(plan.requiredAgentRoles, [
    "researcher",
    "builder",
    "product_reviewer",
    "privacy_reviewer",
    "code_reviewer",
  ]);
  assert.equal(plan.autoMergePolicy.mode, "auto_merge_after_review");
  assert.equal(canAutoMergeSwarmPlan(plan), true);
});

test("keeps blocked privacy work research-only", () => {
  const plan = buildSwarmPlan({
    category: "privacy",
    priority: "p0",
    riskTier: "extra_agent_review",
    privacyRisk: "high",
    labels: [
      "feedback",
      "privacy",
      "priority:p0",
      "risk:extra_agent_review",
      "agent-ready",
    ],
  });

  assert.equal(plan.riskTier, "no_auto_merge");
  assert.deepEqual(plan.requiredAgentRoles, ["researcher", "product_reviewer"]);
  assert.equal(plan.autoMergePolicy.mode, "no_auto_merge");
  assert.equal(canAutoMergeSwarmPlan(plan), false);
});

test("escalates p0 feature work into extra-review builder lanes", () => {
  const plan = buildSwarmPlan({
    category: "feature_request",
    priority: "p0",
    riskTier: "safe_auto_merge",
    privacyRisk: "low",
    labels: [
      "feedback",
      "feature_request",
      "priority:p0",
      "risk:safe_auto_merge",
      "agent-ready",
    ],
  });

  assert.equal(plan.riskTier, "extra_agent_review");
  assert.deepEqual(plan.requiredAgentRoles, [
    "researcher",
    "builder",
    "privacy_reviewer",
    "safety_reviewer",
    "backend_api_reviewer",
    "code_reviewer",
    "test_reviewer",
  ]);
  assert.equal(plan.autoMergePolicy.mode, "multi_review_then_auto_merge");
  assert.equal(canAutoMergeSwarmPlan(plan), true);
});

test("escalates medium privacy safe labels into guarded auto-merge", () => {
  const plan = buildSwarmPlan({
    category: "feature_request",
    priority: "p2",
    riskTier: "safe_auto_merge",
    privacyRisk: "medium",
    labels: [
      "feedback",
      "feature_request",
      "priority:p2",
      "risk:safe_auto_merge",
      "agent-ready",
    ],
  });

  assert.equal(plan.riskTier, "guarded_auto_merge");
  assert.deepEqual(plan.requiredAgentRoles, [
    "researcher",
    "builder",
    "product_reviewer",
    "privacy_reviewer",
    "code_reviewer",
  ]);
  assert.equal(plan.autoMergePolicy.mode, "auto_merge_after_review");
  assert.equal(canAutoMergeSwarmPlan(plan), true);
});

test("requires seven-agent review for safety work that is not p0 blocked", () => {
  const plan = buildSwarmPlan({
    category: "safety_issue",
    priority: "p1",
    riskTier: "safe_auto_merge",
    privacyRisk: "medium",
    labels: [
      "feedback",
      "safety_issue",
      "priority:p1",
      "risk:safe_auto_merge",
      "agent-ready",
    ],
  });

  assert.equal(plan.riskTier, "extra_agent_review");
  assert.deepEqual(plan.requiredAgentRoles, [
    "researcher",
    "builder",
    "privacy_reviewer",
    "safety_reviewer",
    "backend_api_reviewer",
    "code_reviewer",
    "test_reviewer",
  ]);
  assert.equal(plan.autoMergePolicy.mode, "multi_review_then_auto_merge");
  assert.equal(canAutoMergeSwarmPlan(plan), true);
});

test("gates swarm planning on sanitized agent-ready issue labels", () => {
  assert.equal(
    issueLabelsAllowSwarmPlanning([
      "feedback",
      "bug",
      "priority:p2",
      "risk:guarded_auto_merge",
      "agent-ready",
    ]),
    true,
  );
  assert.equal(
    issueLabelsAllowSwarmPlanning([
      "feedback",
      "bug",
      "priority:p2",
      "risk:guarded_auto_merge",
      "swarm-planned",
      "agent-ready",
    ]),
    false,
  );
  assert.equal(
    issueLabelsAllowSwarmPlanning([
      "feedback",
      "bug",
      "priority:p2",
      "risk:guarded_auto_merge",
      "contains-private-context",
      "agent-ready",
    ]),
    false,
  );
  assert.equal(
    issueLabelsAllowSwarmPlanning([
      "feedback",
      "bug",
      "priority:p2",
      "risk:guarded_auto_merge",
    ]),
    false,
  );
});
