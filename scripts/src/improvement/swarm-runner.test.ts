import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSwarmDigest,
  buildSwarmPlanComment,
  planSwarmWorkItem,
  parseSwarmArgs,
  roleToRunType,
  swarmPlanCommentMarker,
} from "./swarm";

const baseWorkItem = {
  id: 7,
  title: "Feedback: settings - confusing feedback button",
  summary: "The settings feedback button is confusing.",
  category: "ux_confusion" as const,
  priority: "p3" as const,
  riskTier: "safe_auto_merge" as const,
  status: "issue_created" as const,
  githubIssueNumber: 12,
  githubIssueUrl: "https://github.com/joewilsonai/heytelli/issues/12",
};

const baseIssue = {
  url: "https://github.com/joewilsonai/heytelli/issues/12",
  number: 12,
  title: "Feedback: settings - confusing feedback button",
  state: "open",
  labels: [
    "feedback",
    "ux_confusion",
    "priority:p3",
    "risk:safe_auto_merge",
    "agent-ready",
  ],
};

test("plans a direct HeyTelli swarm from a sanitized agent-ready issue", () => {
  const result = planSwarmWorkItem(baseWorkItem, baseIssue);

  assert.equal(result.status, "planned");
  if (result.status !== "planned") return;
  assert.equal(result.workItemId, 7);
  assert.equal(result.issueNumber, 12);
  assert.equal(result.plan.riskTier, "safe_auto_merge");
  assert.deepEqual(result.plan.requiredAgentRoles, [
    "researcher",
    "builder",
    "code_reviewer",
  ]);
  assert.equal(result.plan.autoMergePolicy.allowed, true);
});

test("skips issues with blocking privacy or swarm labels", () => {
  const blocked = planSwarmWorkItem(baseWorkItem, {
    ...baseIssue,
    labels: [...baseIssue.labels, "contains-private-context"],
  });

  assert.equal(blocked.status, "skipped");
  assert.equal(blocked.reason, "issue-labels-not-agent-ready");

  const alreadyPlanned = planSwarmWorkItem(baseWorkItem, {
    ...baseIssue,
    labels: [...baseIssue.labels, "swarm-planned"],
  });

  assert.equal(alreadyPlanned.status, "skipped");
  assert.equal(alreadyPlanned.reason, "issue-labels-not-agent-ready");
});

test("uses GitHub issue labels as risk and priority overrides", () => {
  const result = planSwarmWorkItem(
    { ...baseWorkItem, priority: "p3", riskTier: "safe_auto_merge" },
    {
      ...baseIssue,
      labels: ["feedback", "bug", "priority:p0", "risk:safe_auto_merge", "agent-ready"],
    },
  );

  assert.equal(result.status, "planned");
  if (result.status !== "planned") return;
  assert.equal(result.plan.riskTier, "no_auto_merge");
  assert.equal(result.plan.autoMergePolicy.allowed, false);
});

test("builds a privacy-safe issue comment for the planned swarm", () => {
  const result = planSwarmWorkItem(baseWorkItem, baseIssue);
  assert.equal(result.status, "planned");
  if (result.status !== "planned") return;

  const comment = buildSwarmPlanComment(result, "heytelli-swarm-runner");

  assert.match(comment, /HeyTelli swarm plan/);
  assert.match(comment, /researcher/);
  assert.match(comment, /builder/);
  assert.match(comment, /code_reviewer/);
  assert.match(comment, /No private screenshots, transcripts, or dating details/);
  assert.match(comment, /heytelli-swarm-plan:7:12/);
  assert.equal(swarmPlanCommentMarker(result), "heytelli-swarm-plan:7:12");
});

test("maps swarm roles to improvement run types", () => {
  assert.equal(roleToRunType("researcher"), "research");
  assert.equal(roleToRunType("builder"), "implementation");
  assert.equal(roleToRunType("privacy_reviewer"), "review");
  assert.equal(roleToRunType("test_reviewer"), "review");
});

test("parses CLI options for bounded direct swarm runs", () => {
  const options = parseSwarmArgs(
    [
      "--live",
      "--limit",
      "2",
      "--owner=joewilsonai",
      "--repo",
      "heytelli",
      "--github-api-url",
      "https://example.test",
      "--agent-name",
      "local-swarm",
      "--no-comment",
      "--keep-agent-ready",
    ],
    {},
  );

  assert.equal(options.dryRun, false);
  assert.equal(options.limit, 2);
  assert.equal(options.owner, "joewilsonai");
  assert.equal(options.repo, "heytelli");
  assert.equal(options.githubApiUrl, "https://example.test");
  assert.equal(options.agentName, "local-swarm");
  assert.equal(options.commentOnIssues, false);
  assert.equal(options.consumeAgentReadyLabel, false);
});

test("digest reports swarm label side effects", () => {
  const digest = buildSwarmDigest({
    read: 1,
    planned: 1,
    skipped: 0,
    failed: 0,
    commentsCreated: 1,
    agentReadyLabelsRemoved: 1,
    swarmLabelsAdded: 2,
    dbUpdated: 1,
    dryRun: false,
  });

  assert.match(digest, /Mode: live/);
  assert.match(digest, /Swarm labels added: 2/);
});
