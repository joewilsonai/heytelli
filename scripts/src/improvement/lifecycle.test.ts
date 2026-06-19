import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLifecycleResultComment,
  buildLifecycleDigest,
  lifecycleResultCommentMarker,
  parseLifecycleArgs,
  workItemStatusFromPullRequest,
} from "./lifecycle";

test("classifies PR lifecycle into work item statuses", () => {
  assert.equal(
    workItemStatusFromPullRequest("checks_running", {
      state: "open",
      draft: false,
      mergedAt: null,
    }),
    "checks_running",
  );
  assert.equal(
    workItemStatusFromPullRequest("checks_running", {
      state: "open",
      draft: true,
      mergedAt: null,
    }),
    "reviewing",
  );
  assert.equal(
    workItemStatusFromPullRequest("reviewing", {
      state: "closed",
      draft: false,
      mergedAt: null,
    }),
    "closed",
  );
  assert.equal(
    workItemStatusFromPullRequest("checks_running", {
      state: "closed",
      draft: false,
      mergedAt: "2026-05-30T20:00:00Z",
    }),
    "merged",
  );
});

test("parses lifecycle monitor options", () => {
  const options = parseLifecycleArgs(
    ["--live", "--limit", "7", "--agent-name", "monitor"],
    { GITHUB_OWNER: "joe", GITHUB_REPO: "private-repo" },
  );

  assert.equal(options.dryRun, false);
  assert.equal(options.limit, 7);
  assert.equal(options.agentName, "monitor");
  assert.equal(options.owner, "joe");
  assert.equal(options.repo, "private-repo");
  assert.equal(options.commentOnIssues, true);

  const quietOptions = parseLifecycleArgs(["--no-comment"]);
  assert.equal(quietOptions.commentOnIssues, false);
});

test("lifecycle digest summarizes post-merge progress", () => {
  const digest = buildLifecycleDigest({
    read: 3,
    updated: 2,
    merged: 1,
    closed: 1,
    reviewing: 1,
    failed: 0,
    commentsCreated: 1,
    dryRun: false,
  });

  assert.match(digest, /Mode: live/);
  assert.match(digest, /Merged: 1/);
  assert.match(digest, /Closed: 1/);
  assert.match(digest, /Comments created: 1/);
  assert.doesNotMatch(digest, /rawPayload|screenshot|transcript/);
});

test("builds sanitized lifecycle comments for shipped and not-planned outcomes", () => {
  const workItem = {
    id: 43,
    githubIssueNumber: 113,
    pullRequestNumber: 114,
    pullRequestUrl: "https://github.com/joewilsonai/heytelli/pull/114",
  };

  assert.equal(
    lifecycleResultCommentMarker(workItem, "merged"),
    "heytelli-swarm-lifecycle:43:113:merged",
  );

  const shipped = buildLifecycleResultComment({
    workItem,
    nextStatus: "merged",
    pr: {
      url: workItem.pullRequestUrl,
      mergedAt: "2026-06-18T23:51:09Z",
    },
    agentName: "monitor",
  });

  assert.match(shipped, /Result: shipped\/resolved/);
  assert.match(shipped, /Settings feedback status will show this as shipped/);
  assert.match(shipped, /heytelli-swarm-lifecycle:43:113:merged/);
  assert.doesNotMatch(shipped, /transcripts|raw dating details/i);

  const notPlanned = buildLifecycleResultComment({
    workItem,
    nextStatus: "closed",
    pr: {
      url: workItem.pullRequestUrl,
      mergedAt: null,
    },
    agentName: "monitor",
  });

  assert.match(notPlanned, /Result: not shipping right now/);
  assert.match(notPlanned, /closed without merging/);
  assert.match(notPlanned, /not planned right now/);
});
