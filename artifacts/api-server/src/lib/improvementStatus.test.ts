import assert from "node:assert/strict";
import test from "node:test";

import {
  buildImprovementHealthSnapshot,
  buildUserFeedbackStatuses,
  feedbackStageFor,
} from "./improvementStatus";

test("maps user feedback into privacy-safe follow-up stages", () => {
  const createdAt = new Date("2026-05-30T20:00:00Z");
  const updatedAt = new Date("2026-05-30T20:05:00Z");
  const statuses = buildUserFeedbackStatuses(
    [
      {
        id: 10,
        status: "triaged",
        sanitizedSummary: "Settings feedback button is confusing.",
        sanitizedPayload: { type: "Confusing", surface: "settings" },
        createdAt,
        updatedAt,
      },
      {
        id: 11,
        status: "blocked",
        sanitizedSummary: "Feedback received.",
        sanitizedPayload: { type: "Bug" },
        createdAt,
        updatedAt,
      },
    ],
    [
      {
        id: 44,
        signalIds: [10],
        status: "planned",
        pullRequestNumber: null,
        createdAt,
        updatedAt,
      },
    ],
  );

  assert.equal(statuses[0]?.stage, "planned");
  assert.equal(statuses[0]?.message, "Planned or in progress.");
  assert.equal(statuses[0]?.workItemId, 44);
  assert.equal(statuses[0]?.type, "Confusing");
  assert.equal(statuses[0]?.surface, "settings");
  assert.equal(statuses[1]?.stage, "blocked");
  assert.doesNotMatch(JSON.stringify(statuses), /rawPayload|githubIssueUrl/);
});

test("feedback stage helper follows the work item lifecycle", () => {
  assert.equal(feedbackStageFor({ status: "new" }, null), "received");
  assert.equal(feedbackStageFor({ status: "triaged" }, null), "accepted");
  assert.equal(
    feedbackStageFor({ status: "triaged" }, { status: "reviewing" }),
    "planned",
  );
  assert.equal(
    feedbackStageFor({ status: "triaged" }, { status: "deployed" }),
    "shipped",
  );
  assert.equal(feedbackStageFor({ status: "blocked" }, null), "blocked");
});

test("health snapshot summarizes queue and recent run state", () => {
  const snapshot = buildImprovementHealthSnapshot({
    now: new Date("2026-05-30T21:00:00Z"),
    signals: [{ status: "new" }, { status: "triaged" }],
    workItems: [
      {
        status: "planned",
        riskTier: "safe_auto_merge",
        priority: "p3",
        updatedAt: new Date("2026-05-30T20:00:00Z"),
      },
      {
        status: "changes_requested",
        riskTier: "extra_agent_review",
        priority: "p1",
        updatedAt: new Date("2026-05-30T20:30:00Z"),
      },
    ],
    runs: [
      {
        runType: "implementation",
        status: "failed",
        createdAt: new Date("2026-05-30T20:45:00Z"),
        completedAt: new Date("2026-05-30T20:50:00Z"),
      },
    ],
  });

  assert.equal(snapshot.generatedAt, "2026-05-30T21:00:00.000Z");
  assert.equal(snapshot.signals.new, 1);
  assert.equal(snapshot.workItems.planned, 1);
  assert.equal(snapshot.riskTiers.extra_agent_review, 1);
  assert.equal(snapshot.queue.waitingForTriage, 1);
  assert.equal(snapshot.queue.executable, 1);
  assert.equal(snapshot.queue.reviewGated, 1);
  assert.equal(snapshot.queue.needsAttention, 1);
  assert.equal(snapshot.runs["implementation:failed"], 1);
  assert.equal(snapshot.lastRunAt, "2026-05-30T20:50:00.000Z");
});
