import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBlockedSwarmRecoveryWorkItem,
  buildSwarmDigest,
  buildSwarmBreakdownComment,
  buildSwarmPlanComment,
  buildSwarmRecoveryComment,
  issueLabelsAllowRecoveryPlanning,
  planSwarmWorkItem,
  parseSwarmArgs,
  roleToRunType,
  runImprovementSwarm,
  swarmRunShouldFail,
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
  fingerprint: "settings-feedback-confusing-button",
  signalIds: [101],
  impactScore: 2,
  confidenceScore: 3,
  frequencyCount: 1,
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
      labels: [
        "feedback",
        "bug",
        "priority:p0",
        "risk:safe_auto_merge",
        "agent-ready",
      ],
    },
  );

  assert.equal(result.status, "planned");
  if (result.status !== "planned") return;
  assert.equal(result.plan.riskTier, "extra_agent_review");
  assert.equal(result.plan.autoMergePolicy.allowed, true);
  assert.match(
    buildSwarmPlanComment(result, "heytelli-swarm-runner"),
    /\$[0-9]+\.[0-9]{2}/,
  );
});

test("keeps explicit no-auto labels out of builder execution", () => {
  const result = planSwarmWorkItem(
    { ...baseWorkItem, priority: "p0", riskTier: "extra_agent_review" },
    {
      ...baseIssue,
      labels: [
        "feedback",
        "privacy",
        "priority:p0",
        "risk:no_auto_merge",
        "agent-ready",
      ],
    },
  );

  assert.equal(result.status, "planned");
  if (result.status !== "planned") return;
  assert.equal(result.plan.riskTier, "no_auto_merge");
  assert.deepEqual(result.plan.requiredAgentRoles, [
    "researcher",
    "product_reviewer",
  ]);
  assert.equal(result.plan.autoMergePolicy.allowed, false);
});

test("breaks broad agent-ready issues into child PR-sized work items", () => {
  const result = planSwarmWorkItem(
    {
      ...baseWorkItem,
      title: "Feedback: safe date flow needs end-to-end polish",
      summary: [
        "Safe date flow needs several coordinated changes:",
        "- Add backend storage for selected date templates.",
        "- Add mobile UI for choosing a template and editing the date card.",
        "- Add automation coverage so TestFlight builds verify the flow.",
      ].join("\n"),
    },
    {
      ...baseIssue,
      title: "Feedback: safe date flow needs end-to-end polish",
      labels: [...baseIssue.labels, "needs-breakdown"],
    },
  );

  assert.equal(result.status, "needs-breakdown");
  if (result.status !== "needs-breakdown") return;
  assert.equal(result.workItemId, 7);
  assert.equal(result.issueNumber, 12);
  assert.equal(result.children.length, 3);
  assert.deepEqual(
    result.children.map((child) => child.title),
    [
      "Safe date flow: Add backend storage for selected date templates",
      "Safe date flow: Add mobile UI for choosing a template and editing the date card",
      "Safe date flow: Add automation coverage so TestFlight builds verify the flow",
    ],
  );
  assert.deepEqual(
    result.children.map((child) => child.fingerprint),
    [
      "settings-feedback-confusing-button:child:1",
      "settings-feedback-confusing-button:child:2",
      "settings-feedback-confusing-button:child:3",
    ],
  );
  for (const child of result.children) {
    assert.equal(child.status, "draft");
    assert.equal(child.riskTier, "safe_auto_merge");
    assert.equal(child.githubIssueDraft.labels.includes("agent-ready"), true);
    assert.equal(
      child.githubIssueDraft.labels.includes("needs-breakdown"),
      false,
    );
    assert.match(child.githubIssueDraft.body, /Parent issue: #12/);
    assert.match(child.githubIssueDraft.body, /PR-sized child issue/);
    assert.doesNotMatch(
      child.githubIssueDraft.body,
      /screenshots|transcripts|phone numbers|raw dating details/i,
    );
  }
});

test("builds a parent breakdown comment without private implementation details", () => {
  const result = planSwarmWorkItem(
    {
      ...baseWorkItem,
      title: "Feedback: safe date flow needs end-to-end polish",
      summary: [
        "Safe date flow needs several coordinated changes:",
        "- Add backend storage for selected date templates.",
        "- Add mobile UI for choosing a template and editing the date card.",
      ].join("\n"),
    },
    {
      ...baseIssue,
      title: "Feedback: safe date flow needs end-to-end polish",
      labels: [...baseIssue.labels, "needs-breakdown"],
    },
  );
  assert.equal(result.status, "needs-breakdown");
  if (result.status !== "needs-breakdown") return;

  const comment = buildSwarmBreakdownComment(result, [
    "https://github.com/joewilsonai/heytelli/issues/21",
    "https://github.com/joewilsonai/heytelli/issues/22",
  ]);

  assert.match(comment, /HeyTelli swarm breakdown/);
  assert.match(comment, /Parent work item: #7/);
  assert.match(comment, /#21/);
  assert.match(comment, /#22/);
  assert.match(comment, /heytelli-swarm-breakdown:7:12/);
  assert.doesNotMatch(comment, /selected date templates|editing the date card/);
});

test("builds a sanitized recovery issue for blocked swarm work", () => {
  const blockedIssue = {
    ...baseIssue,
    number: 53,
    url: "https://github.com/joewilsonai/heytelli/issues/53",
    title: "Date Card hardening: backend and data model",
    labels: [
      "swarm-blocked",
      "priority:p1",
      "risk:extra_agent_review",
      "privacy",
      "safety",
      "security",
      "architecture",
    ],
  };

  assert.equal(issueLabelsAllowRecoveryPlanning(blockedIssue.labels), true);

  const recovery = buildBlockedSwarmRecoveryWorkItem(
    {
      ...baseWorkItem,
      id: 14,
      priority: "p1",
      riskTier: "extra_agent_review",
      fingerprint: "date-card-backend",
    },
    blockedIssue,
  );

  assert.equal(recovery.fingerprint, "date-card-backend:recovery:53");
  assert.equal(recovery.title, "Recovery: blocked swarm issue #53");
  assert.equal(
    recovery.githubIssueDraft.title,
    "Recovery: blocked swarm issue #53",
  );
  assert.equal(recovery.riskTier, "extra_agent_review");
  assert.equal(recovery.githubIssueDraft.labels.includes("agent-ready"), true);
  assert.equal(
    recovery.githubIssueDraft.labels.includes("risk:extra_agent_review"),
    true,
  );
  assert.equal(
    recovery.githubIssueDraft.labels.includes("risk:no_auto_merge"),
    false,
  );
  assert.equal(
    recovery.githubIssueDraft.labels.includes("swarm-blocked"),
    false,
  );
  assert.equal(
    recovery.githubIssueDraft.labels.includes("swarm-recovery"),
    true,
  );
  assert.match(recovery.githubIssueDraft.body, /Do not store match_id/);
  assert.match(recovery.githubIssueDraft.body, /recipient PII/);
  assert.match(recovery.githubIssueDraft.body, /must be executable/i);
  assert.doesNotMatch(
    recovery.githubIssueDraft.body,
    /raw transcript|screenshot text|555-1212|123 Main/i,
  );
  assert.doesNotMatch(recovery.githubIssueDraft.title, /Date Card hardening/);

  const comment = buildSwarmRecoveryComment(
    blockedIssue,
    recovery,
    "https://github.com/joewilsonai/heytelli/issues/58",
  );
  assert.match(comment, /Recovery issue: #58/);
  assert.match(comment, /not treated as a dead end/);
  assert.doesNotMatch(comment, /Date Card hardening: backend and data model/);
});

test("does not recover blocked issues that are known to contain private context", () => {
  assert.equal(
    issueLabelsAllowRecoveryPlanning([
      "swarm-blocked",
      "risk:extra_agent_review",
      "contains-private-context",
    ]),
    false,
  );
});

test("allows blocked recovery repair after the recovery label was added", () => {
  assert.equal(
    issueLabelsAllowRecoveryPlanning([
      "swarm-blocked",
      "swarm-recovery-created",
      "risk:extra_agent_review",
    ]),
    true,
  );
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
  assert.match(
    comment,
    /No private screenshots, transcripts, or dating details/,
  );
  assert.match(comment, /private repo/i);
  assert.match(comment, /GitHub-visible/i);
  assert.doesNotMatch(comment, /public GitHub|public handoff/i);
  assert.match(comment, /heytelli-swarm-plan:7:12/);
  assert.doesNotMatch(comment, /confusing feedback button/);
  assert.doesNotMatch(comment, /The settings feedback button is confusing/);
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
  const counts = {
    read: 1,
    blockedRead: 0,
    planned: 1,
    skipped: 0,
    failed: 0,
    commentsCreated: 1,
    agentReadyLabelsRemoved: 1,
    swarmLabelsAdded: 2,
    breakdownsCreated: 0,
    childIssuesCreated: 0,
    recoveryIssuesCreated: 0,
    dbUpdated: 1,
    dryRun: false,
  };
  const digest = buildSwarmDigest({
    ...counts,
  });

  assert.match(digest, /Mode: live/);
  assert.match(digest, /Swarm labels added: 2/);
  assert.equal(swarmRunShouldFail(counts), false);
  assert.equal(swarmRunShouldFail({ ...counts, failed: 1 }), true);
});

test("requires database access even for dry-run queue planning", async () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  try {
    await assert.rejects(
      runImprovementSwarm({
        dryRun: true,
        owner: "joewilsonai",
        repo: "heytelli",
        token: "token",
        limit: 1,
        agentName: "test-runner",
        commentOnIssues: false,
        consumeAgentReadyLabel: false,
      }),
      /DATABASE_URL missing/,
    );
  } finally {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  }
});
