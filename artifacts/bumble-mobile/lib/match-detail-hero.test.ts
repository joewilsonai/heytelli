import assert from "node:assert/strict";
import test from "node:test";

import { getMatchDetailHeroModel } from "./match-detail-hero.ts";

const baseMatch = {
  id: 1,
  name: "Maya Rose",
  status: "active",
  vibeTags: [],
  tags: [],
  extractedProfile: {
    job: null,
    location: null,
    interests: [],
    mentionedTopics: [],
    conversationTone: null,
    scores: {
      sexPotential: { value: null, rationale: null },
      conversionAbility: { value: null, rationale: null },
      chemistry: { value: null, rationale: null },
    },
  },
  notes: "",
  nextDateAt: null,
  nextDateLocation: null,
  dateHistory: [],
  createdAt: "2026-05-20T00:00:00.000Z",
  updatedAt: "2026-05-20T00:00:00.000Z",
  lastDateBrief: null,
  dateBriefFreshness: "missing",
  lastRead: null,
  readFreshness: "missing",
  lastSpeaker: null,
  lastActivityAt: null,
  pendingScreenshotCount: 0,
  failedScreenshotCount: 0,
  analysisFreshness: "current",
};

test("hero asks for a Date Card before a planned date", () => {
  const model = getMatchDetailHeroModel(
    {
      ...baseMatch,
      nextDateAt: "2026-05-24T00:00:00.000Z",
    },
    new Date("2026-05-23T01:00:00.000Z"),
  );

  assert.equal(model.eyebrow, "Upcoming date");
  assert.equal(model.title, "Make Date Card");
  assert.match(model.body, /place, time, transport/);
});

test("hero prioritizes waiting screenshots over old reads", () => {
  const model = getMatchDetailHeroModel({
    ...baseMatch,
    pendingScreenshotCount: 2,
    analysisFreshness: "needs-analysis",
    lastRead: {
      body: "A saved read remains visible.",
      generatedAt: "2026-05-26T12:00:00.000Z",
      screenshotCountAt: 1,
    },
    readFreshness: "stale",
  });

  assert.equal(model.title, "Review screenshots");
  assert.match(model.body, /Keep the saved read visible/);
});

test("hero uses pattern language for saved high-severity concerns", () => {
  const model = getMatchDetailHeroModel({
    ...baseMatch,
    redFlagSummary: {
      currentCount: 0,
      historicalCount: 1,
      highSeverityCount: 1,
      lastAnalyzedAt: "2026-05-26T12:00:00.000Z",
    },
  });

  assert.equal(model.title, "Review pattern");
  assert.match(model.body, /saved pattern/);
  assert.ok(model.chips.includes("Saved pattern"));
});
