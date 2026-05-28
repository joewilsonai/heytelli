import assert from "node:assert/strict";
import test from "node:test";

const readyPlan = {
  trustedCircleName: "Claire W, Maya H, roommate",
  transportPlan: "rideshare there, own ride home",
  checkInAt: "2026-06-01T02:30:00.000Z",
  expectedEndAt: "2026-06-01T05:00:00.000Z",
  codeWord: "private-code-token",
  circleNote: "Private check-in note.",
  shareLiveLocation: true,
  safeDateChecklist: {
    publicPlace: true,
    ownTransport: true,
    circleHasPlan: true,
    profileReviewed: true,
    noPrivateLocationPressure: true,
    noMoneyOrPhotoPressure: true,
  },
  circleCheckStatus: "planned",
  lastCircleCheckAt: null,
  coverModeEnabled: true,
  coverModeTheme: "clock",
  dateModeStatus: "date_card_sent",
  dateModeStartedAt: null,
  dateModeClosedAt: null,
  updatedAt: "2026-05-28T17:00:00.000Z",
};

test("builds a date card share record only for the first sent transition", async () => {
  const { buildDateCardSharePersistence } = await import("./dateCardShare");

  const firstShare = buildDateCardSharePersistence({
    userId: 2,
    matchId: 7,
    matchName: "Michael S",
    nextDateAt: new Date("2026-06-01T02:00:00.000Z"),
    nextDateLocation: "Venue with street-level detail",
    existingPlan: { ...readyPlan, dateModeStatus: "planning" },
    nextPlan: readyPlan,
    observedAt: new Date("2026-05-28T17:00:00.000Z"),
  });

  assert.equal(firstShare?.dateCard.userId, 2);
  assert.equal(firstShare?.dateCard.matchId, 7);
  assert.equal(firstShare?.dateCard.state, "sent");
  assert.deepEqual(firstShare?.dateCard.payload, {
    matchFirstName: "Michael",
    dateTime: "2026-06-01T02:00:00.000Z",
    hasVenue: true,
    hasTransportPlan: true,
    hasCheckIn: true,
    hasExpectedEnd: true,
    trustedCircleLabels: ["Claire", "Maya", "roommate"],
    includesCodeWord: true,
    includesCircleNote: true,
    liveLocationIntent: true,
  });
  assert.equal(firstShare?.timelineEvent.type, "date_card_shared");
  assert.equal(firstShare?.timelineEvent.source, "user");
  assert.equal(firstShare?.timelineEvent.title, "Date Card shared");
  assert.doesNotMatch(
    JSON.stringify(firstShare),
    /street-level|private-code-token|Private check-in note/,
  );

  const duplicate = buildDateCardSharePersistence({
    userId: 2,
    matchId: 7,
    matchName: "Michael S",
    nextDateAt: new Date("2026-06-01T02:00:00.000Z"),
    nextDateLocation: "Venue with street-level detail",
    existingPlan: readyPlan,
    nextPlan: readyPlan,
    observedAt: new Date("2026-05-28T17:01:00.000Z"),
  });

  assert.equal(duplicate, null);
});

test("does not create a date card share record for non-sent safety updates", async () => {
  const { buildDateCardSharePersistence } = await import("./dateCardShare");

  const result = buildDateCardSharePersistence({
    userId: 2,
    matchId: 7,
    matchName: "Michael",
    nextDateAt: new Date("2026-06-01T02:00:00.000Z"),
    nextDateLocation: "The Library Bar",
    existingPlan: { ...readyPlan, dateModeStatus: "planning" },
    nextPlan: { ...readyPlan, dateModeStatus: "on_date" },
    observedAt: new Date("2026-05-28T17:00:00.000Z"),
  });

  assert.equal(result, null);
});
