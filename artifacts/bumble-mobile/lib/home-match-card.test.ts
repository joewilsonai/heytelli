import assert from "node:assert/strict";
import test from "node:test";

import { getHomeMatchCardModel, getFirstName } from "./home-match-card.ts";

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

test("uses first name as the dashboard identity", () => {
  assert.equal(getFirstName("Maya Rose"), "Maya");
  assert.equal(getFirstName("  Ana-Maria  "), "Ana-Maria");
});

test("asks for more context when analysis has not happened", () => {
  const model = getHomeMatchCardModel({
    ...baseMatch,
    analysisFreshness: "never-analyzed",
  });

  assert.equal(model.name, "Maya");
  assert.equal(model.signal.label, "Needs more context");
  assert.equal(model.nextAction, "Upload latest chat");
});

test("marks stale active matches when she was the last speaker over 48 hours ago", () => {
  const model = getHomeMatchCardModel(
    {
      ...baseMatch,
      lastSpeaker: "her",
      lastActivityAt: "2026-05-20T00:00:00.000Z",
    },
    new Date("2026-05-23T01:00:00.000Z"),
  );

  assert.equal(model.signal.label, "Stale");
  assert.equal(model.nextAction, "Follow up or let it fade");
});

test("surfaces date safety when a future date is planned", () => {
  const model = getHomeMatchCardModel(
    {
      ...baseMatch,
      nextDateAt: "2026-05-24T00:00:00.000Z",
    },
    new Date("2026-05-23T01:00:00.000Z"),
  );

  assert.equal(model.status.label, "Date planned");
  assert.equal(model.nextAction, "Plan date safety");
  assert.ok(model.contextChips.includes("Date set"));
});

test("uses connection and momentum scores without exposing old score labels", () => {
  const model = getHomeMatchCardModel({
    ...baseMatch,
    extractedProfile: {
      ...baseMatch.extractedProfile,
      scores: {
        sexPotential: { value: 1, rationale: null },
        conversionAbility: { value: 8, rationale: null },
        chemistry: { value: 9, rationale: null },
      },
    },
    lastActivityAt: "2026-05-22T00:00:00.000Z",
  });

  assert.equal(model.signal.label, "Promising");
  assert.deepEqual(
    model.contextChips.filter((chip) => /Sex|Conv|Chem/.test(chip)),
    [],
  );
});

test("keeps the last read visible when newer screenshots are waiting", () => {
  const model = getHomeMatchCardModel({
    ...baseMatch,
    lastRead: {
      body: "The latest analyzed read says the thread is warm but still light on planning.",
      generatedAt: "2026-05-26T12:00:00.000Z",
      screenshotCountAt: 3,
    },
    readFreshness: "stale",
    pendingScreenshotCount: 2,
    analysisFreshness: "needs-analysis",
  });

  assert.equal(model.read.title, "Last read");
  assert.match(model.read.body, /warm but still light/);
  assert.equal(model.read.freshnessLabel, "2 screenshots waiting");
  assert.equal(model.signal.label, "Needs more context");
});

test("shows persisted reads as up to date when API freshness is current", () => {
  const model = getHomeMatchCardModel({
    ...baseMatch,
    lastRead: {
      body: "This read was stored after the latest analyzed screenshots.",
      generatedAt: "2026-05-26T12:00:00.000Z",
      screenshotCountAt: 2,
    },
    readFreshness: "current",
  });

  assert.equal(
    model.read.body,
    "This read was stored after the latest analyzed screenshots.",
  );
  assert.equal(model.read.freshnessLabel, "Up to date");
  assert.equal(model.read.tone, "success");
});

test("surfaces saved red flag history on the dashboard", () => {
  const model = getHomeMatchCardModel({
    ...baseMatch,
    redFlagSummary: {
      currentCount: 0,
      historicalCount: 1,
      highSeverityCount: 1,
      lastAnalyzedAt: "2026-05-26T12:00:00.000Z",
    },
  });

  assert.equal(model.signal.label, "Saved concern");
  assert.equal(model.signal.tone, "danger");
  assert.equal(model.nextAction, "Review saved concern");
  assert.ok(model.contextChips.includes("1 concern"));
});
