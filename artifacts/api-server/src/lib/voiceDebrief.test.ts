import assert from "node:assert/strict";
import { test } from "node:test";

process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ??= "http://127.0.0.1:1/openai";
process.env.AI_INTEGRATIONS_OPENAI_API_KEY ??= "test-openai-key";

test("voice debrief prompt is HeyTelli-native and avoids legacy scoring", async () => {
  const { DEBRIEF_SYSTEM_PROMPT } = await import("./voiceDebrief");

  assert.match(DEBRIEF_SYSTEM_PROMPT, /HeyTelli/);
  assert.doesNotMatch(DEBRIEF_SYSTEM_PROMPT, /Grok/i);
  assert.doesNotMatch(DEBRIEF_SYSTEM_PROMPT, /sexPotential|conversionAbility|chemistry/);
  assert.match(DEBRIEF_SYSTEM_PROMPT, /tagsToAdd/);
  assert.match(DEBRIEF_SYSTEM_PROMPT, /readUpdate/);
});

test("normalizes debrief analysis into durable routing fields", async () => {
  const { normalizeDebriefAnalysis } = await import("./voiceDebrief");

  const analysis = normalizeDebriefAnalysis(
    {
      summary: "  Good first date. ",
      vibe: "  steady interest ",
      greenFlags: ["Asked about my family", ""],
      redFlags: ["Dodged scheduling"],
      tagsToAdd: [
        { tag: "Family-Oriented", reason: "Asked about family" },
        { tag: "slow burn", reason: "" },
      ],
      date: {
        isDate: true,
        when: "2026-05-25T01:00:00.000Z",
        location: "Louie",
        recap: "Dinner and drinks",
      },
      readUpdate: "Interested, but watch follow-through.",
      timelineTitle: "Dinner debrief",
      nextMoveSuggestion: "Offer one specific plan.",
      scoreSuggestions: {
        sexPotential: { value: 10, rationale: "legacy field should be ignored" },
      },
    },
    "fallback transcript",
  );

  assert.deepEqual(analysis, {
    summary: "Good first date.",
    vibe: "steady interest",
    greenFlags: ["Asked about my family"],
    redFlags: ["Dodged scheduling"],
    nextMoveSuggestion: "Offer one specific plan.",
    tagsToAdd: [
      { tag: "Family-Oriented", reason: "Asked about family" },
      { tag: "slow burn", reason: null },
    ],
    date: {
      isDate: true,
      when: "2026-05-25T01:00:00.000Z",
      location: "Louie",
      recap: "Dinner and drinks",
    },
    readUpdate: "Interested, but watch follow-through.",
    timelineTitle: "Dinner debrief",
  });
});
