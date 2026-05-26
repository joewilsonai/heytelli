import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildRedFlagEventRows,
  summarizeRedFlagHistory,
} from "./redFlagHistory";

test("summarizes current red flags while preserving previously seen concerns", () => {
  const firstSeen = new Date("2026-05-24T12:00:00.000Z");
  const currentSeen = new Date("2026-05-26T12:00:00.000Z");
  const historical = buildRedFlagEventRows({
    matchId: 7,
    source: "radar",
    runId: "run-old",
    contextHash: "old-context",
    observedAt: firstSeen,
    redFlags: [
      {
        severity: "high",
        label: "Late-night-only texting",
        evidence: "He only reaches out after midnight.",
      },
    ],
  });
  const current = {
    severity: "medium" as const,
    label: "Dodges plans",
    evidence: "He changes the subject when she suggests a time.",
  };
  const currentRows = buildRedFlagEventRows({
    matchId: 7,
    source: "radar",
    runId: "run-new",
    contextHash: "new-context",
    observedAt: currentSeen,
    redFlags: [current],
  });

  const summary = summarizeRedFlagHistory({
    events: [...historical, ...currentRows],
    currentRedFlags: [current],
  });

  assert.deepEqual(
    summary.currentRedFlags.map((f) => [f.label, f.status]),
    [["Dodges plans", "current"]],
  );
  assert.deepEqual(
    summary.historicalRedFlags.map((f) => [f.label, f.status]),
    [["Late-night-only texting", "previously-seen"]],
  );
  assert.equal(summary.redFlags.length, 2);
  assert.equal(summary.highSeverityCount, 1);
});

test("returns saved flag details even when the caller only needs stored history", () => {
  const firstSeen = new Date("2026-05-24T12:00:00.000Z");
  const historical = buildRedFlagEventRows({
    matchId: 7,
    source: "radar",
    runId: "run-old",
    contextHash: "old-context",
    observedAt: firstSeen,
    redFlags: [
      {
        severity: "medium",
        label: "Slow follow-through",
        evidence: "He went quiet after plans came up.",
      },
    ],
  });

  const summary = summarizeRedFlagHistory({
    events: historical,
    currentRedFlags: [],
  });

  assert.deepEqual(
    summary.redFlags.map((f) => [f.label, f.evidence, f.status]),
    [
      [
        "Slow follow-through",
        "He went quiet after plans came up.",
        "previously-seen",
      ],
    ],
  );
});

test("redacts contact info and hides historical duplicates already represented by current flags", () => {
  const oldRows = buildRedFlagEventRows({
    matchId: 7,
    source: "radar",
    runId: "run-old",
    contextHash: "old-context",
    observedAt: new Date("2026-05-24T12:00:00.000Z"),
    redFlags: [
      {
        severity: "medium",
        label: "Early gap after proposed meeting",
        evidence: "After she got 3143781486, she went quiet after plans.",
      },
    ],
  });
  const current = {
    severity: "medium" as const,
    label: "Slow gap after direct ask",
    evidence: "After she got 3143781486, she went quiet after plans.",
  };

  const summary = summarizeRedFlagHistory({
    events: oldRows,
    currentRedFlags: [current],
    generatedAt: new Date("2026-05-26T12:00:00.000Z"),
  });

  assert.equal(summary.currentRedFlags.length, 1);
  assert.equal(summary.historicalRedFlags.length, 0);
  assert.match(summary.redFlags[0].evidence, /\[phone number\]/);
  assert.doesNotMatch(summary.redFlags[0].evidence, /3143781486/);
});
