import assert from "node:assert/strict";
import test from "node:test";

import { buildImprovementDigest } from "./digest";
import { createGitHubIssue } from "./github";
import {
  mergeDuplicateWorkItem,
  planSignalTriage,
  shouldCreateGithubIssue,
} from "./triage";

test("plans actionable signal as sanitized github-ready work", () => {
  const plan = planSignalTriage({
    id: 7,
    fingerprint: "profile-failed",
    rawPayload: {
      source: "in_app_feedback",
      type: "Bug",
      message: "Profile analysis failed on iOS build 3.",
      surface: "settings-profile",
      clientContext: { platform: "ios", buildNumber: "3" },
    },
    sanitizedSummary: "Profile analysis failed on iOS build 3.",
    sanitizedPayload: {
      type: "Bug",
      message: "Profile analysis failed on iOS build 3.",
      surface: "settings-profile",
      platform: "ios",
      buildNumber: "3",
    },
    privacyRisk: "low",
  });

  assert.equal(plan.signalStatus, "triaged");
  assert.equal(plan.workItem.category, "bug");
  assert.equal(plan.issueDraft?.labels.includes("agent-ready"), true);
  assert.doesNotMatch(plan.issueDraft?.body ?? "", /rawPayload|signalIds/);
});

test("blocked privacy risk never creates a github issue", () => {
  const plan = planSignalTriage({
    id: 8,
    fingerprint: "raw-private-content",
    rawPayload: {
      source: "in_app_feedback",
      type: "Bug",
      message: "The app sent a screenshot data:image/png;base64,abc",
      screenshot: "data:image/png;base64,abc",
    },
    sanitizedSummary: "The app sent a [private content] [image omitted]",
    sanitizedPayload: {
      type: "Bug",
      message: "The app sent a [private content] [image omitted]",
    },
    privacyRisk: "blocked",
  });

  assert.equal(plan.signalStatus, "blocked");
  assert.equal(plan.issueDraft, null);
  assert.equal(shouldCreateGithubIssue(plan), false);
});

test("duplicate signal increments frequency and retains source ids", () => {
  const merged = mergeDuplicateWorkItem(
    {
      frequencyCount: 2,
      signalIds: [1, 2],
    },
    2,
  );
  const mergedAgain = mergeDuplicateWorkItem(merged, 3);

  assert.deepEqual(merged.signalIds, [1, 2]);
  assert.equal(merged.frequencyCount, 2);
  assert.deepEqual(mergedAgain.signalIds, [1, 2, 3]);
  assert.equal(mergedAgain.frequencyCount, 3);
});

test("dry-run plans count github issues that would be opened", () => {
  const plan = planSignalTriage({
    id: 9,
    fingerprint: "settings-confusing",
    rawPayload: {
      source: "in_app_feedback",
      type: "Confusing",
      message: "The settings feedback button was confusing.",
      surface: "settings",
    },
    sanitizedSummary: "The settings feedback button was confusing.",
    sanitizedPayload: {
      type: "Confusing",
      message: "The settings feedback button was confusing.",
      surface: "settings",
    },
    privacyRisk: "low",
  });

  assert.equal(shouldCreateGithubIssue(plan), true);
  assert.ok(plan.issueDraft);
});

test("github client dry-run does not call fetch", async () => {
  let called = false;
  const result = await createGitHubIssue({
    owner: "joewilsonai",
    repo: "heytelli",
    token: null,
    dryRun: true,
    draft: {
      title: "Feedback: dry run",
      body: "No private screenshots/transcripts included.",
      labels: ["feedback", "bug", "priority:p2", "risk:safe_auto_merge"],
    },
    fetchImpl: async () => {
      called = true;
      throw new Error("should not call fetch in dry run");
    },
  });

  assert.equal(called, false);
  assert.equal(result.mode, "dry-run");
  assert.equal(result.url, null);
});

test("github client reuses existing issue by fingerprint marker", async () => {
  const calls: string[] = [];
  const result = await createGitHubIssue({
    owner: "joewilsonai",
    repo: "heytelli",
    token: "token",
    dryRun: false,
    dedupeKey: "abc123",
    draft: {
      title: "Feedback: duplicate",
      body: "No private screenshots/transcripts included.",
      labels: ["feedback", "bug", "priority:p2", "risk:safe_auto_merge"],
    },
    fetchImpl: async (input) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({
          items: [
            {
              html_url: "https://github.com/joewilsonai/heytelli/issues/44",
              number: 44,
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    },
  });

  assert.equal(result.mode, "live");
  assert.equal(result.number, 44);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /search\/issues/);
});

test("digest summarizes counts without private payload fields", () => {
  const digest = buildImprovementDigest({
    read: 4,
    workItemsCreated: 2,
    duplicatesGrouped: 1,
    issuesCreated: 1,
    blocked: 1,
    waitingForSignal: 0,
    dryRun: false,
    rolledBack: 0,
  });

  assert.match(digest, /Work items created: 2/);
  assert.match(digest, /Issues opened: 1/);
  assert.doesNotMatch(digest, /rawPayload|screenshot|transcript|phone/);
});

test("digest names dry-run issue previews clearly", () => {
  const digest = buildImprovementDigest({
    read: 1,
    workItemsCreated: 1,
    duplicatesGrouped: 0,
    issuesCreated: 1,
    blocked: 0,
    waitingForSignal: 0,
    dryRun: true,
    rolledBack: 0,
  });

  assert.match(digest, /Issue drafts previewed: 1/);
  assert.doesNotMatch(digest, /Issues opened: 1/);
});
