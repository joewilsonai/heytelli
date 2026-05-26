import assert from "node:assert/strict";
import test from "node:test";

import {
  SAFE_DATE_CHECKLIST_ITEMS,
  buildCircleCheckMessage,
  buildDateCardMessage,
  buildSoftExitMessage,
  getDateSafetyChecklistProgress,
  getDateSafetyPlanStatus,
  type DateSafetyPlanMatch,
} from "./date-safety-plan.ts";

const baseMatch: DateSafetyPlanMatch = {
  name: "Maya Rose",
  nextDateAt: "2026-06-01T00:30:00.000Z",
  nextDateLocation: "Paper Plane",
  dateSafetyPlan: {
    trustedCircleName: "Claire",
    transportPlan: "Rideshare both ways",
    checkInAt: "2026-06-01T01:30:00.000Z",
    expectedEndAt: "2026-06-01T03:00:00.000Z",
    codeWord: "Pineapple",
    circleNote: "Text Claire if I miss the check-in.",
    shareLiveLocation: false,
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
    updatedAt: "2026-05-31T20:00:00.000Z",
  },
  screenshots: [{ objectPath: "screenshots/private-chat.png" }],
  screenshotObjectPath: "screenshots/latest.png",
};

test("marks a complete future date plan as ready", () => {
  const status = getDateSafetyPlanStatus(
    baseMatch,
    new Date("2026-05-31T20:00:00.000Z"),
  );

  assert.equal(status.state, "ready");
  assert.equal(status.label, "Ready for circle");
  assert.deepEqual(status.missing, []);
});

test("marks list-status-only date plans as ready without needing secrets", () => {
  const status = getDateSafetyPlanStatus(
    {
      name: "Maya Rose",
      nextDateAt: "2026-06-01T00:30:00.000Z",
      nextDateLocation: "Paper Plane",
      dateSafetyPlanStatus: {
        hasPlan: true,
        hasTrustedCircle: true,
        hasTransportPlan: true,
        hasCheckIn: true,
        hasExpectedEnd: true,
        hasCodeWord: true,
        hasCircleNote: true,
        shareLiveLocation: false,
        safeDateChecklistReady: true,
        circleCheckStatus: "planned",
        lastCircleCheckAt: null,
        updatedAt: "2026-05-31T20:00:00.000Z",
      },
    },
    new Date("2026-05-31T20:00:00.000Z"),
  );

  assert.equal(status.state, "ready");
  assert.deepEqual(status.missing, []);
});

test("lists missing required fields without treating code word or note as required", () => {
  const status = getDateSafetyPlanStatus(
    {
      name: "Maya",
      nextDateAt: null,
      nextDateLocation: " ",
      dateSafetyPlan: {
        transportPlan: "",
        trustedCircleName: "",
        checkInAt: null,
        expectedEndAt: undefined,
      },
    },
    new Date("2026-05-31T20:00:00.000Z"),
  );

  assert.equal(status.state, "missing");
  assert.deepEqual(status.missing, [
    "date time",
    "location",
    "circle",
    "transport",
    "check-in",
    "expected end",
    "safe date steps",
  ]);
});

test("requires the safe date walkthrough before marking the plan ready", () => {
  const status = getDateSafetyPlanStatus(
    {
      ...baseMatch,
      dateSafetyPlan: {
        ...baseMatch.dateSafetyPlan,
        safeDateChecklist: {
          publicPlace: true,
          ownTransport: false,
          circleHasPlan: true,
          profileReviewed: false,
          noPrivateLocationPressure: true,
          noMoneyOrPhotoPressure: true,
        },
      },
    },
    new Date("2026-05-31T20:00:00.000Z"),
  );

  assert.equal(status.state, "missing");
  assert.deepEqual(status.missing, ["safe date steps"]);
});

test("summarizes safe date checklist progress", () => {
  const progress = getDateSafetyChecklistProgress({
    publicPlace: true,
    ownTransport: true,
    circleHasPlan: false,
    profileReviewed: true,
    noPrivateLocationPressure: false,
    noMoneyOrPhotoPressure: true,
  });

  assert.equal(SAFE_DATE_CHECKLIST_ITEMS.length, 6);
  assert.equal(progress.completed, 4);
  assert.equal(progress.total, 6);
  assert.equal(progress.ready, false);
  assert.deepEqual(progress.missingKeys, [
    "circleHasPlan",
    "noPrivateLocationPressure",
  ]);
});

test("marks past planned dates as expired", () => {
  const status = getDateSafetyPlanStatus(
    baseMatch,
    new Date("2026-06-01T04:00:00.000Z"),
  );

  assert.equal(status.state, "expired");
  assert.equal(status.label, "Date passed");
});

test("builds a privacy-first date card message from allowed fields only", () => {
  const message = buildDateCardMessage(baseMatch);

  assert.match(message, /Date with: Maya/);
  assert.match(
    message,
    /Time: Sun, May 31, 7:30 PM|Time: Mon, Jun 1, 12:30 AM/,
  );
  assert.match(message, /Location: Paper Plane/);
  assert.match(message, /Transport: Rideshare both ways/);
  assert.match(message, /Check-in:/);
  assert.match(message, /Expected end:/);
  assert.match(message, /Code word: Pineapple/);
  assert.match(message, /Note: Text Claire if I miss the check-in\./);
  assert.match(message, /Safety scan: public place, own ride, circle informed/);
  assert.doesNotMatch(message, /Rose/);
  assert.doesNotMatch(message, /screenshot/i);
  assert.doesNotMatch(message, /objectPath/);
  assert.doesNotMatch(message, /private-chat/);
  assert.match(message, /No images included/);
});

test("builds circle check messages for safe and completed states", () => {
  assert.equal(
    buildCircleCheckMessage(baseMatch, "safe"),
    "I'm safe at my date with Maya at Paper Plane. Check-in complete.",
  );
  assert.equal(
    buildCircleCheckMessage(baseMatch, "completed"),
    "Date with Maya is complete. I'm leaving Paper Plane now.",
  );
});

test("omits absent optional code word and circle note", () => {
  const message = buildDateCardMessage({
    ...baseMatch,
    dateSafetyPlan: {
      trustedCircleName: "Claire",
      transportPlan: "Driving myself",
      checkInAt: "2026-06-01T01:30:00.000Z",
      expectedEndAt: "2026-06-01T03:00:00.000Z",
    },
  });

  assert.doesNotMatch(message, /Code word:/);
  assert.doesNotMatch(message, /Note:/);
});

test("builds intent-specific soft exit messages using only first name and safe plan fields", () => {
  const message = buildSoftExitMessage(baseMatch, "call");

  assert.equal(
    message,
    "Can you call me? I may need a soft exit from my date with Maya at Paper Plane. Code word: Pineapple.",
  );
  assert.doesNotMatch(message, /Rose/);
  assert.doesNotMatch(message, /screenshot/i);
});

test("supports pickup soft exit intent without requiring a code word", () => {
  const message = buildSoftExitMessage(
    {
      ...baseMatch,
      dateSafetyPlan: {
        trustedCircleName: "Claire",
        transportPlan: "Drove myself",
        checkInAt: "2026-06-01T01:30:00.000Z",
        expectedEndAt: "2026-06-01T03:00:00.000Z",
      },
    },
    "pickup",
  );

  assert.equal(
    message,
    "Can you help me leave? I may need a pickup from my date with Maya at Paper Plane.",
  );
});
