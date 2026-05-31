import assert from "node:assert/strict";
import test from "node:test";
import { buildEvidenceSections, buildMatchSummary } from "./view-models";

test("builds Calm Read summaries without legacy scoring language", () => {
  const summary = buildMatchSummary({
    id: 7,
    name: "Maya",
    status: "active",
    overallRead: "There is steady interest, but pace is still unfolding.",
    readFreshness: "current",
    lastRead: {
      body: "She is engaged and asking follow-up questions.",
      generatedAt: "2026-05-31T12:00:00Z",
      screenshotCountAt: 2,
    },
    currentRedFlags: [],
    greenFlags: [{ label: "Reciprocal effort", evidence: "She suggested a day." }],
    redFlagSummary: {
      currentCount: 0,
      historicalCount: 0,
      highSeverityCount: 0,
      lastAnalyzedAt: "2026-05-31T12:00:00Z",
    },
    pendingScreenshotCount: 0,
    failedScreenshotCount: 0,
    analysisFreshness: "current",
  });

  assert.equal(summary.primaryLabel, "Calm Read");
  assert.equal(summary.safetyLabel, "No current safety flags");
  assert.ok(summary.badges.includes("1 green flag"));
  assert.doesNotMatch(JSON.stringify(summary).toLowerCase(), /bumble|sex potential|conversion ability|chemistry score/);
});

test("groups evidence into user-readable sections", () => {
  const sections = buildEvidenceSections({
    currentRedFlags: [
      { severity: "medium", label: "Pressure", evidence: "Pushed past a boundary." },
    ],
    historicalRedFlags: [
      { severity: "low", label: "Uneven reply pace", evidence: "Long silence earlier." },
    ],
    greenFlags: [{ label: "Specific planning", evidence: "Offered a clear date idea." }],
    timelineEvents: [
      {
        id: 1,
        matchId: 7,
        type: "manual_note",
        source: "user",
        title: "Added note",
        summary: "Asked about weekend plans.",
        body: null,
        metadata: {},
        occurredAt: "2026-05-31T12:00:00Z",
        createdAt: "2026-05-31T12:00:00Z",
      },
    ],
    transcript: [{ speaker: "her", text: "Saturday works for me." }],
  });

  assert.deepEqual(
    sections.map((section) => [section.id, section.count]),
    [
      ["safety", 2],
      ["green", 1],
      ["timeline", 1],
      ["transcript", 1],
    ],
  );
});
