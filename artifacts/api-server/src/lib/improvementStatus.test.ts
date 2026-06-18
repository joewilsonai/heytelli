import assert from "node:assert/strict";
import test from "node:test";

import {
  buildImprovementControlRoomSnapshot,
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
    [
      {
        workItemId: 44,
        runType: "research",
        agentName: "heytelli-swarm-planner",
        status: "succeeded",
        summary: "Planner accepted the sanitized feedback for agent work.",
        createdAt: new Date("2026-05-30T20:03:00Z"),
        completedAt: new Date("2026-05-30T20:04:00Z"),
      },
    ],
  );

  assert.equal(statuses[0]?.stage, "planned");
  assert.equal(statuses[0]?.message, "Planned or in progress.");
  assert.equal(statuses[0]?.workItemId, 44);
  assert.equal(statuses[0]?.type, "Confusing");
  assert.equal(statuses[0]?.surface, "settings");
  assert.deepEqual(
    statuses[0]?.timeline.map((event) => event.event),
    ["feedback_received", "feedback_grouped", "agent_research", "planned"],
  );
  assert.equal(statuses[0]?.timeline[2]?.agentName, "heytelli-swarm-planner");
  assert.match(statuses[0]?.timeline[2]?.body ?? "", /sanitized feedback/);
  assert.equal(statuses[1]?.stage, "blocked");
  assert.deepEqual(
    statuses[1]?.timeline.map((event) => event.event),
    ["feedback_received", "privacy_blocked"],
  );
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
    [
      {
        workItemId: 55,
        runType: "review",
        agentName: "decision-agent",
        status: "succeeded",
        summary: "Decision recorded as outside the beta mobile scope.",
        createdAt,
        completedAt: createdAt,
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
  assert.equal(status?.timeline.at(-1)?.event, "not_planned");
  assert.match(status?.timeline.at(-1)?.body ?? "", /Desktop admin work/);
});

test("user feedback status includes release proof for shipped work", () => {
  const createdAt = new Date("2026-06-18T20:00:00Z");
  const updatedAt = new Date("2026-06-18T21:00:00Z");
  const [status] = buildUserFeedbackStatuses(
    [
      {
        id: 30,
        status: "resolved",
        sanitizedSummary: "Add a calmer empty state.",
        sanitizedPayload: { type: "Idea", surface: "home" },
        createdAt,
        updatedAt,
      },
    ],
    [
      {
        id: 88,
        signalIds: [30],
        status: "deployed",
        decisionCategory: "shipped",
        decisionDetails: "Included in the latest beta build.",
        frequencyCount: 3,
        decisionReconsiderAfterCount: 5,
        pullRequestNumber: 123,
        createdAt,
        updatedAt,
      },
    ],
    [
      {
        workItemId: 88,
        runType: "implementation",
        agentName: "executor-agent",
        status: "succeeded",
        summary: "Implemented and opened a release-ready pull request.",
        createdAt: new Date("2026-06-18T20:10:00Z"),
        completedAt: new Date("2026-06-18T20:30:00Z"),
      },
      {
        workItemId: 88,
        runType: "deploy",
        agentName: "lifecycle-agent",
        status: "succeeded",
        summary: "Build shipped to beta.",
        createdAt: new Date("2026-06-18T20:40:00Z"),
        completedAt: updatedAt,
      },
    ],
  );

  assert.equal(status?.stage, "shipped");
  assert.equal(status?.timeline.at(-1)?.event, "shipped");
  assert.equal(status?.timeline.at(-1)?.proof, "Beta release proof recorded.");
  assert.doesNotMatch(JSON.stringify(status), /pullRequestUrl|githubIssueUrl/);
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

test("control room snapshot exposes demo-safe agent and demand state", () => {
  const snapshot = buildImprovementControlRoomSnapshot({
    now: new Date("2026-06-18T22:00:00Z"),
    signals: [{ status: "new" }, { status: "triaged" }],
    workItems: [
      {
        id: 7,
        title: "Feedback: settings colors",
        status: "closed",
        category: "feature_request",
        riskTier: "safe_auto_merge",
        priority: "p3",
        decisionCategory: "not_planned",
        decisionDetails: "Waiting for stronger beta demand.",
        frequencyCount: 5,
        decisionReconsiderAfterCount: 5,
        updatedAt: new Date("2026-06-18T21:00:00Z"),
      },
      {
        id: 8,
        title: "Feedback: profile empty state",
        status: "planned",
        category: "ux_confusion",
        riskTier: "guarded_auto_merge",
        priority: "p2",
        decisionCategory: null,
        decisionDetails: null,
        frequencyCount: 2,
        decisionReconsiderAfterCount: 5,
        updatedAt: new Date("2026-06-18T21:30:00Z"),
      },
    ],
    runs: [
      {
        runType: "implementation",
        status: "succeeded",
        agentName: "executor-agent",
        summary: "Opened a PR for the sanitized request.",
        createdAt: new Date("2026-06-18T21:20:00Z"),
        completedAt: new Date("2026-06-18T21:25:00Z"),
      },
    ],
  });

  assert.equal(snapshot.generatedAt, "2026-06-18T22:00:00.000Z");
  assert.equal(snapshot.queue.reconsiderCandidates, 1);
  assert.equal(snapshot.agentLanes.some((lane) => lane.id === "builder"), true);
  assert.equal(snapshot.reconsiderCandidates[0]?.id, 7);
  assert.equal(snapshot.recentWorkItems[0]?.id, 8);
  assert.equal(snapshot.recentRuns[0]?.agentName, "executor-agent");
  assert.match(snapshot.demoScript.join(" "), /beta user/i);
  assert.doesNotMatch(JSON.stringify(snapshot), /rawPayload|githubIssueUrl|pullRequestUrl/);
});
