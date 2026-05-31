import assert from "node:assert/strict";
import test from "node:test";

import { getCalmReadModel } from "./calm-read.ts";

const baseMatch = {
  id: 1,
  name: "Gretchen Moon",
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
  dateSafetyPlan: null,
  lastRead: null,
  readFreshness: "missing",
  lastSpeaker: null,
  lastActivityAt: null,
  pendingScreenshotCount: 0,
  failedScreenshotCount: 0,
  analysisFreshness: "current",
  redFlags: [],
  currentRedFlags: [],
  historicalRedFlags: [],
  greenFlags: [],
  overallRead: "",
  redFlagSummary: {
    currentCount: 0,
    historicalCount: 0,
    highSeverityCount: 0,
    lastAnalyzedAt: null,
  },
  timelineEvents: [],
  screenshots: [],
  transcript: [],
};

test("calibrates a low-risk post-date ambiguity case without crisis language", () => {
  const model = getCalmReadModel({
    ...baseMatch,
    lastSpeaker: "her",
    dateHistory: [
      {
        when: "2026-05-28",
        location: "Louie",
        recap: "First date went well.",
      },
    ],
    lastRead: {
      body: "Warm, reciprocal, and easygoing. Interested but noncommittal on timing.",
      generatedAt: "2026-05-29T12:00:00.000Z",
      screenshotCountAt: 4,
    },
    readFreshness: "current",
    overallRead:
      "Warm, reciprocal, and easygoing. Interested but noncommittal on timing.",
    greenFlags: [
      {
        label: "Warm follow-through",
        evidence: "She planned and showed up.",
      },
    ],
    currentRedFlags: [
      {
        severity: "low",
        label: "Post-date soft availability",
        evidence: "Not sure about next weekend.",
        status: "current",
      },
    ],
  });

  assert.equal(model.label, "The Calm Read");
  assert.equal(model.safety.level, "Low");
  assert.equal(model.clarity.level, "Mixed");
  assert.equal(model.pace.level, "Moderate");
  assert.match(model.headline, /Momentum is not confirmed/i);
  assert.match(model.safety.sentence, /not a safety concern/i);
  assert.match(model.nextMove, /Reply once/i);
  assert.doesNotMatch(
    `${model.summary} ${model.nextMove}`,
    /hotline|RAINN|dangerous|unsafe/i,
  );
});

test("escalates strong safety evidence into elevated safety risk", () => {
  const model = getCalmReadModel({
    ...baseMatch,
    currentRedFlags: [
      {
        severity: "high",
        label: "Threats or intimidation",
        evidence:
          "Pattern detected: uses threats to influence what happens next.",
        status: "current",
      },
    ],
    redFlagSummary: {
      currentCount: 1,
      historicalCount: 0,
      highSeverityCount: 1,
      lastAnalyzedAt: "2026-05-29T12:00:00.000Z",
    },
  });

  assert.equal(model.safety.level, "Elevated");
  assert.match(model.safety.sentence, /safety support/i);
  assert.match(model.nextMove, /Share this with your circle/i);
});

test("keeps stale saved read visible while marking screenshots waiting", () => {
  const model = getCalmReadModel({
    ...baseMatch,
    pendingScreenshotCount: 2,
    analysisFreshness: "needs-analysis",
    readFreshness: "stale",
    lastRead: {
      body: "The saved read still matters.",
      generatedAt: "2026-05-29T12:00:00.000Z",
      screenshotCountAt: 3,
    },
  });

  assert.equal(model.freshness.label, "2 screenshots waiting");
  assert.match(model.summary, /saved read still matters/i);
  assert.match(model.nextMove, /Analyze the new screenshots/i);
});

test("marks old planning concerns as partially resolved after a completed date", () => {
  const model = getCalmReadModel({
    ...baseMatch,
    dateHistory: [
      {
        when: "2026-05-28",
        location: "Louie",
        recap: "Completed first date.",
      },
    ],
    historicalRedFlags: [
      {
        severity: "low",
        label: "Ignored direct meetup ask",
        evidence: "Earlier plans were vague.",
        status: "previously-seen",
      },
    ],
  });

  assert.equal(model.patternStates[0]?.state, "Partially resolved");
  assert.match(
    model.patternStates[0]?.reason ?? "",
    /later planned or completed/i,
  );
});
