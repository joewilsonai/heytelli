import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildMatchReadSnapshot,
  computeMatchReadFreshness,
  normalizeMatchReadSnapshot,
} from "./matchRead";

const profile = {
  job: "Designer",
  location: "Austin",
  interests: ["coffee", "live music"],
  mentionedTopics: ["Sunday plans"],
  conversationTone: "Warm, curious, and a little inconsistent.",
  visibleMedia: [],
  scores: {
    sexPotential: { value: null, rationale: null },
    conversionAbility: {
      value: 6,
      rationale: "She is engaged but has not moved toward plans yet.",
    },
    chemistry: {
      value: 7,
      rationale: "The banter is easy and she asks follow-up questions.",
    },
  },
};

test("builds a durable read snapshot from the latest analysis", () => {
  const read = buildMatchReadSnapshot({
    profile,
    transcript: [{ speaker: "her", text: "How was your weekend?" }],
    screenshotCountAt: 3,
    generatedAt: new Date("2026-05-26T12:00:00.000Z"),
  });

  assert.equal(read.screenshotCountAt, 3);
  assert.equal(read.generatedAt, "2026-05-26T12:00:00.000Z");
  assert.match(read.body, /Warm, curious/);
});

test("prefers an explicit model read over fallback profile text", () => {
  const read = buildMatchReadSnapshot({
    profile,
    transcript: [],
    explicitRead:
      "He is keeping the thread alive, but planning energy is still unclear.",
    screenshotCountAt: 1,
    generatedAt: new Date("2026-05-26T12:00:00.000Z"),
  });

  assert.equal(
    read.body,
    "He is keeping the thread alive, but planning energy is still unclear.",
  );
});

test("normalizes stored read snapshots from the database", () => {
  assert.deepEqual(normalizeMatchReadSnapshot(null), null);
  assert.deepEqual(
    normalizeMatchReadSnapshot({
      body: "  Solid read.  ",
      generatedAt: "2026-05-26T12:00:00.000Z",
      screenshotCountAt: 2,
    }),
    {
      body: "Solid read.",
      generatedAt: "2026-05-26T12:00:00.000Z",
      screenshotCountAt: 2,
    },
  );
});

test("flags persisted reads as stale when screenshots are waiting", () => {
  const freshness = computeMatchReadFreshness({
    lastRead: {
      body: "Existing read.",
      generatedAt: "2026-05-26T12:00:00.000Z",
      screenshotCountAt: 2,
    },
    doneScreenshotCount: 2,
    pendingScreenshotCount: 1,
    failedScreenshotCount: 0,
  });

  assert.equal(freshness, "stale");
});

test("marks persisted reads current when all screenshots are represented", () => {
  const freshness = computeMatchReadFreshness({
    lastRead: {
      body: "Existing read.",
      generatedAt: "2026-05-26T12:00:00.000Z",
      screenshotCountAt: 2,
    },
    doneScreenshotCount: 2,
    pendingScreenshotCount: 0,
    failedScreenshotCount: 0,
  });

  assert.equal(freshness, "current");
});
