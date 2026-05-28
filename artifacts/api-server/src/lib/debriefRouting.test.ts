import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??=
  "postgres://heytelli:heytelli@127.0.0.1:1/heytelli";
process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ??= "http://127.0.0.1:1/openai";
process.env.AI_INTEGRATIONS_OPENAI_API_KEY ??= "test-openai-key";

import {
  buildDebriefPersistencePlan,
  type DebriefRoutingAnalysis,
} from "./debriefRouting";

const baseAnalysis: DebriefRoutingAnalysis = {
  summary:
    "She was warm and present, but got evasive when plans became concrete.",
  vibe: "warm but cautious",
  greenFlags: ["Asked follow-up questions"],
  redFlags: ["Deflected a clear planning question"],
  nextMoveSuggestion: "Ask for a specific day and watch whether she engages.",
  tagsToAdd: [
    { tag: "Thoughtful", reason: "She asked good follow-ups." },
    { tag: "slow-burn", reason: "Interest is there but pacing is measured." },
    { tag: "slow-burn", reason: "Duplicate should be ignored." },
  ],
  date: {
    isDate: false,
    when: null,
    location: null,
    recap: null,
  },
  readUpdate: "Warm, but verify follow-through before overinvesting.",
  timelineTitle: "Coffee debrief",
};

test("voice debriefs persist a transcript timeline event without appending to notes or scores", () => {
  const plan = buildDebriefPersistencePlan({
    matchId: 7,
    matchName: "Gretchen",
    source: "voice-debrief",
    transcript: "We had coffee. She was sweet but dodged making plans.",
    analysis: baseAnalysis,
    addToDateHistory: false,
    existingTags: ["fitness"],
    existingNotes: "Original private note",
    nextDateAt: null,
    nextDateLocation: null,
    doneScreenshotCount: 3,
    now: new Date("2026-05-26T16:00:00.000Z"),
  });

  assert.equal("notes" in plan.matchUpdates, false);
  assert.equal("extractedProfile" in plan.matchUpdates, false);
  assert.deepEqual(plan.scoreHistory, []);
  assert.equal(plan.mainTimelineEvent.type, "voice_debrief");
  assert.equal(plan.mainTimelineEvent.title, "Coffee debrief");
  assert.match(plan.mainTimelineEvent.body ?? "", /We had coffee/);
  assert.deepEqual(plan.matchUpdates.lastRead, {
    body: "Warm, but verify follow-through before overinvesting.",
    generatedAt: "2026-05-26T16:00:00.000Z",
    screenshotCountAt: 3,
  });
});

test("debrief tags are normalized, deduped, and recorded as AI tag events", () => {
  const plan = buildDebriefPersistencePlan({
    matchId: 7,
    matchName: "Gretchen",
    source: "voice-debrief",
    transcript: "She asked a lot of questions.",
    analysis: baseAnalysis,
    addToDateHistory: false,
    existingTags: ["fitness", "slow-burn"],
    existingNotes: "",
    nextDateAt: null,
    nextDateLocation: null,
    doneScreenshotCount: 0,
    now: new Date("2026-05-26T16:00:00.000Z"),
  });

  assert.deepEqual(plan.matchUpdates.tags, [
    "fitness",
    "slow-burn",
    "thoughtful",
  ]);
  assert.deepEqual(
    plan.tagEvents.map((event) => ({
      tag: event.tag,
      action: event.action,
      source: event.source,
      reason: event.reason,
    })),
    [
      {
        tag: "thoughtful",
        action: "added",
        source: "ai",
        reason: "She asked good follow-ups.",
      },
    ],
  );
  assert.equal(
    plan.timelineEvents.some(
      (event) => event.type === "tag_added" && event.title === "thoughtful",
    ),
    true,
  );
});

test("date debriefs create date history and route the main event as date_debrief", () => {
  const plan = buildDebriefPersistencePlan({
    matchId: 7,
    matchName: "Gretchen",
    source: "voice-debrief",
    transcript: "Dinner ran long and we talked about a second date.",
    analysis: {
      ...baseAnalysis,
      date: {
        isDate: true,
        when: "2026-05-25T01:00:00.000Z",
        location: "Louie",
        recap: "Dinner ran long and she brought up seeing each other again.",
      },
    },
    addToDateHistory: false,
    existingTags: [],
    existingNotes: "",
    nextDateAt: new Date("2026-05-25T01:00:00.000Z"),
    nextDateLocation: "Louie",
    doneScreenshotCount: 0,
    now: new Date("2026-05-26T16:00:00.000Z"),
  });

  assert.equal(plan.mainTimelineEvent.type, "date_debrief");
  assert.equal(plan.matchUpdates.nextDateAt, null);
  assert.equal(plan.matchUpdates.nextDateLocation, null);
  assert.equal(plan.matchUpdates.dateHistory?.length, 1);
  assert.equal(plan.matchUpdates.dateHistory?.[0]?.location, "Louie");
  assert.match(
    plan.matchUpdates.dateHistory?.[0]?.recap ?? "",
    /Dinner ran long/,
  );
});

test("green and red flags are split into durable timeline events", () => {
  const plan = buildDebriefPersistencePlan({
    matchId: 7,
    matchName: "Gretchen",
    source: "voice-debrief",
    transcript: "She was kind but deflected plans.",
    analysis: baseAnalysis,
    addToDateHistory: false,
    existingTags: [],
    existingNotes: "",
    nextDateAt: null,
    nextDateLocation: null,
    doneScreenshotCount: 0,
    now: new Date("2026-05-26T16:00:00.000Z"),
  });

  assert.deepEqual(plan.redFlagLabels, ["Deflected a clear planning question"]);
  assert.equal(
    plan.timelineEvents.some(
      (event) =>
        event.type === "green_flag_seen" &&
        event.title === "Asked follow-up questions",
    ),
    true,
  );
  assert.equal(
    plan.timelineEvents.some(
      (event) =>
        event.type === "red_flag_seen" &&
        event.title === "Deflected a clear planning question",
    ),
    true,
  );
});

test("db schema exports durable match timeline events", async () => {
  const { matchTimelineEvents } = await import("@workspace/db");

  assert.ok(matchTimelineEvents);
});
