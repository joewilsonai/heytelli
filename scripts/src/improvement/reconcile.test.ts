import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReconciliationDigest,
  planImprovementReconciliation,
} from "./reconcile";

test("plans cleanup for terminal generated worktrees and local branches", () => {
  const actions = planImprovementReconciliation({
    worktrees: [{ workItemId: 42, path: "/repo/.worktrees/swarm-executor/42" }],
    localBranches: ["swarm/42-settings-colors", "main"],
    workItems: [
      {
        id: 42,
        status: "closed",
        branchName: "swarm/42-settings-colors",
        githubIssueNumber: 102,
        pullRequestNumber: null,
      },
    ],
    issues: [],
    pullRequests: [],
  });

  assert.deepEqual(
    actions.map((action) => action.type),
    ["remove_worktree", "delete_local_branch"],
  );
  assert.match(actions[0]?.reason ?? "", /terminal/);
});

test("plans stale swarm-active label cleanup when issue is not active", () => {
  const actions = planImprovementReconciliation({
    worktrees: [],
    localBranches: [],
    workItems: [
      {
        id: 43,
        status: "planned",
        branchName: "swarm/43-copy",
        githubIssueNumber: 103,
        pullRequestNumber: null,
      },
    ],
    issues: [
      {
        number: 103,
        state: "open",
        labels: ["feedback", "swarm-active", "agent-ready"],
      },
    ],
    pullRequests: [],
  });

  assert.deepEqual(actions, [
    {
      type: "remove_issue_label",
      workItemId: 43,
      issueNumber: 103,
      label: "swarm-active",
      reason: "Issue has swarm-active but the work item is not in an active executor state.",
    },
  ]);
});

test("plans DB status repair when a pull request already merged", () => {
  const actions = planImprovementReconciliation({
    worktrees: [],
    localBranches: [],
    workItems: [
      {
        id: 44,
        status: "checks_running",
        branchName: "swarm/44-empty-state",
        githubIssueNumber: 104,
        pullRequestNumber: 120,
      },
    ],
    issues: [],
    pullRequests: [{ number: 120, state: "closed", mergedAt: "2026-06-18T22:00:00Z" }],
  });

  assert.deepEqual(actions, [
    {
      type: "update_work_item_status",
      workItemId: 44,
      nextStatus: "merged",
      reason: "GitHub pull request is merged but the work item has not caught up.",
    },
  ]);
});

test("reconciliation digest summarizes action counts", () => {
  const digest = buildReconciliationDigest({
    dryRun: true,
    actions: [
      { type: "remove_worktree", workItemId: 1, path: "/tmp/1", reason: "done" },
      { type: "remove_issue_label", workItemId: 1, issueNumber: 9, label: "swarm-active", reason: "stale" },
    ],
  });

  assert.match(digest, /Mode: dry run/);
  assert.match(digest, /Actions planned: 2/);
  assert.match(digest, /remove_worktree: 1/);
  assert.match(digest, /remove_issue_label: 1/);
});
