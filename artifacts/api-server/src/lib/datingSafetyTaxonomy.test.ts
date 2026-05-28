import assert from "node:assert/strict";
import { test } from "node:test";

import {
  detectDatingSafetyRedFlags,
  mergeSafetyRedFlags,
} from "./datingSafetyTaxonomy";
import type {
  DateHistoryEntry,
  ExtractedProfile,
  TranscriptTurn,
} from "@workspace/db";
import type { RedFlag } from "./redFlagRadar";

const profile: ExtractedProfile = {
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
};

function turn(
  speaker: TranscriptTurn["speaker"],
  text: string,
): TranscriptTurn {
  return {
    speaker,
    text,
  };
}

function dateEntry(recap: string): DateHistoryEntry {
  return {
    id: crypto.randomUUID(),
    when: "2026-05-26T12:00:00.000Z",
    location: "Coffee shop",
    recap,
    createdAt: "2026-05-26T12:00:00.000Z",
  } as DateHistoryEntry;
}

test("detects romance scams and sextortion without blaming the user", () => {
  const flags = detectDatingSafetyRedFlags({
    name: "Sam",
    profile,
    transcript: [
      turn("her", "My wallet is frozen. Can you send me $300 in gift cards?"),
      turn("her", "Send nude pics and keep it secret between us."),
    ],
    dateHistory: [],
    notes: "",
  });

  assert.deepEqual(
    flags.map((flag) => [flag.severity, flag.label]),
    [
      ["high", "Romance scam or urgent money pressure"],
      ["high", "Sextortion or intimate image pressure"],
    ],
  );
  assert.match(flags[0].evidence, /asks for money or gift cards/i);
  assert.doesNotMatch(
    flags.map((flag) => flag.evidence).join(" "),
    /\byou should have\b/i,
  );
});

test("detects boundary pressure, stalking or harassment, digital privacy, threats, and unsafe first-date dynamics", () => {
  const flags = detectDatingSafetyRedFlags({
    name: "Sam",
    profile,
    transcript: [
      turn(
        "her",
        "Stop saying no. If you liked me you would come over tonight.",
      ),
      turn(
        "her",
        "I saw your car at work and waited outside after you stopped replying.",
      ),
      turn(
        "her",
        "Send your address and a live location screenshot. What is your phone password?",
      ),
      turn("her", "If you cancel, I will hurt you."),
    ],
    dateHistory: [
      dateEntry(
        "He insisted on picking her up at home, pushed drinks, and kept the venue secret.",
      ),
    ],
    notes: "She wants to keep the first meetup public.",
  });

  assert.deepEqual(
    flags.map((flag) => [flag.severity, flag.label]),
    [
      ["medium", "Boundary pressure after a no"],
      ["high", "Stalking or harassment signals"],
      ["medium", "Digital privacy pressure"],
      ["high", "Threats or intimidation"],
      ["medium", "Unsafe first-date setup pressure"],
    ],
  );
  assert.ok(flags.every((flag) => flag.evidence.includes("Pattern detected:")));
});

test("does not turn ordinary photo sharing or reassurance into safety flags", () => {
  const flags = detectDatingSafetyRedFlags({
    name: "Gretchen",
    profile,
    transcript: [
      turn("her", "Send me photos of your deck lights when you get them up."),
      turn(
        "her",
        "No worries, I just want you to know I'm not ignoring you tonight.",
      ),
      turn("me", "Sorry to trauma dump, it felt safe to share with you."),
    ],
    dateHistory: [],
    notes: "",
  });

  assert.deepEqual(flags, []);
});

test("merges deterministic safety flags with AI flags and dedupes by normalized label", () => {
  const aiFlags: RedFlag[] = [
    {
      severity: "low",
      label: "  boundary   pressure after a NO ",
      evidence: "AI saw the same concern.",
    },
    {
      severity: "low",
      label: "Slow replies",
      evidence: "Takes a day to respond.",
    },
  ];
  const safetyFlags: RedFlag[] = [
    {
      severity: "medium",
      label: "Boundary pressure after a no",
      evidence: "Pattern detected: keeps pushing after a stated no.",
    },
  ];

  assert.deepEqual(mergeSafetyRedFlags(aiFlags, safetyFlags), [
    safetyFlags[0],
    aiFlags[1],
  ]);
});
