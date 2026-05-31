import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLifecycleDigest,
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
});

test("lifecycle digest summarizes post-merge progress", () => {
  const digest = buildLifecycleDigest({
    read: 3,
    updated: 2,
    merged: 1,
    closed: 1,
    reviewing: 1,
    failed: 0,
    dryRun: false,
  });

  assert.match(digest, /Mode: live/);
  assert.match(digest, /Merged: 1/);
  assert.match(digest, /Closed: 1/);
  assert.doesNotMatch(digest, /rawPayload|screenshot|transcript/);
});
