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
        decisionCategory: null,
        decisionDetails: null,
        frequencyCount: 1,
        decisionReconsiderAfterCount: 3,
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
    feedbackStageFor(
      { status: "triaged" },
      { status: "reviewing", decisionCategory: null },
    ),
    "planned",
  );
  assert.equal(
    feedbackStageFor(
      { status: "triaged" },
      { status: "deployed", decisionCategory: null },
    ),
    "shipped",
  );
  assert.equal(
    feedbackStageFor(
      { status: "resolved" },
      { status: "closed", decisionCategory: "out_of_scope" },
    ),
    "not_planned",
  );
  assert.equal(feedbackStageFor({ status: "blocked" }, null), "blocked");
});

test("user feedback status explains not-planned decisions", () => {
  const createdAt = new Date("2026-06-18T20:00:00Z");
  const [status] = buildUserFeedbackStatuses(
    [
      {
        id: 20,
        status: "resolved",
        sanitizedSummary: "Please add a desktop-only admin dashboard.",
        sanitizedPayload: { type: "Idea", surface: "settings" },
        createdAt,
        updatedAt: createdAt,
      },
    ],
    [
      {
        id: 55,
        signalIds: [20],
        status: "closed",
        decisionCategory: "out_of_scope",
        decisionDetails: "Desktop admin work is outside the beta mobile scope.",
        frequencyCount: 4,
        decisionReconsiderAfterCount: 5,
        pullRequestNumber: null,
        createdAt,
        updatedAt: createdAt,
      },
    ],
  );

  assert.equal(status?.stage, "not_planned");
  assert.equal(status?.decisionCategory, "out_of_scope");
  assert.equal(
    status?.decisionDetails,
    "Desktop admin work is outside the beta mobile scope.",
  );
  assert.equal(status?.frequencyCount, 4);
  assert.match(status?.message ?? "", /Not planned right now/);
  assert.match(status?.message ?? "", /outside the beta mobile scope/);
  assert.match(status?.message ?? "", /If more beta users ask/);
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
        decisionCategory: null,
        frequencyCount: 1,
        decisionReconsiderAfterCount: 3,
        updatedAt: new Date("2026-05-30T20:00:00Z"),
      },
      {
        status: "changes_requested",
        riskTier: "extra_agent_review",
        priority: "p1",
        decisionCategory: null,
        frequencyCount: 1,
        decisionReconsiderAfterCount: 3,
        updatedAt: new Date("2026-05-30T20:30:00Z"),
      },
      {
        status: "closed",
        riskTier: "safe_auto_merge",
        priority: "p3",
        decisionCategory: "not_planned",
        frequencyCount: 5,
        decisionReconsiderAfterCount: 5,
        updatedAt: new Date("2026-05-30T20:40:00Z"),
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
  assert.equal(snapshot.queue.reconsiderCandidates, 1);
  assert.equal(snapshot.runs["implementation:failed"], 1);
  assert.equal(snapshot.lastRunAt, "2026-05-30T20:50:00.000Z");
});
