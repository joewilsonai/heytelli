import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  DateHistoryEntry,
  ExtractedProfile,
  RedFlagRadarSnapshot,
  TranscriptTurn,
} from "@workspace/db";

process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ??= "http://127.0.0.1:1/openai";
process.env.AI_INTEGRATIONS_OPENAI_API_KEY ??= "test-openai-key";

const profile: ExtractedProfile = {
  job: "designer",
  location: "north side",
  interests: ["ceramics", "live music"],
  mentionedTopics: ["farmers market"],
  conversationTone: "warm but inconsistent",
  visibleMedia: [
    {
      kind: "profile_photo",
      description: "climbing gym photo",
      source: "profile",
      speaker: null,
    },
  ],
  scores: {
    sexPotential: { value: null, rationale: null },
    conversionAbility: { value: null, rationale: null },
    chemistry: { value: null, rationale: null },
  },
};

const transcript: TranscriptTurn[] = [
  { speaker: "her", text: "I can do Sunday afternoon." },
  { speaker: "me", text: "Great, want to do coffee?" },
  { speaker: "her", text: "Coffee sounds easy." },
];

const dateHistory: DateHistoryEntry[] = [
  {
    id: "date_1",
    when: "2026-05-18T19:00:00.000Z",
    location: "wine bar",
    recap: "Easy conversation, but follow-through got slower after.",
    createdAt: "2026-05-18T23:00:00.000Z",
  },
];

const patterns: RedFlagRadarSnapshot = {
  redFlags: [
    {
      severity: "medium",
      label: "Late replies after plans",
      evidence: "Went quiet after a time was proposed.",
    },
  ],
  greenFlags: [
    {
      label: "Suggests specific windows",
      evidence: "Offered Sunday afternoon.",
    },
  ],
  overallRead: "Interested, but consistency drops once plans get concrete.",
  generatedAt: "2026-05-30T12:00:00.000Z",
  contextHash: "test-context",
};

test("cheat sheet prompt includes profile, conversation, patterns, tags, notes, and scheduled date", async () => {
  const { openai } = await import("@workspace/integrations-openai-ai-server");
  const { generateCheatSheet } = await import("./cheatSheet");

  type CompletionPayload = {
    messages?: Array<{ role: string; content: string }>;
  };
  type CompletionResponse = {
    choices: Array<{ message: { content: string } }>;
  };
  type CompletionCreate = (
    payload: CompletionPayload,
  ) => Promise<CompletionResponse>;

  const completions = openai.chat.completions as unknown as {
    create: CompletionCreate;
  };
  const originalCreate = completions.create;
  const calls: CompletionPayload[] = [];

  completions.create = async (payload) => {
    calls.push(payload);
    return {
      choices: [
        {
          message: {
            content: JSON.stringify({
              replies: [
                { style: "playful", text: "Sunday coffee it is." },
                { style: "curious", text: "What kind of coffee mood?" },
                { style: "direct", text: "Let's lock Sunday afternoon." },
              ],
            }),
          },
        },
      ],
    };
  };

  try {
    await generateCheatSheet("Ava", profile, transcript, {
      tags: ["slow-burn", "planning"],
      notes: "Sunday is easiest; keep the reply calm and do not over-chase.",
      dateHistory,
      nextDateAt: "2026-06-01T20:00:00.000Z",
      nextDateLocation: "coffee shop",
      lastRedFlagRadar: patterns,
    });

    const userMessage = calls[0]?.messages?.find(
      (message) => message.role === "user",
    )?.content;

    assert.match(userMessage ?? "", /Job: designer/);
    assert.match(userMessage ?? "", /Location: north side/);
    assert.match(userMessage ?? "", /Recent topics: farmers market/);
    assert.match(userMessage ?? "", /Visible media: climbing gym photo/);
    assert.match(userMessage ?? "", /Current tags: slow-burn, planning/);
    assert.match(userMessage ?? "", /Late replies after plans/);
    assert.match(userMessage ?? "", /Interested, but consistency drops/);
    assert.match(userMessage ?? "", /Sunday is easiest/);
    assert.match(userMessage ?? "", /Upcoming date: 2026-06-01T20:00:00.000Z/);
    assert.match(userMessage ?? "", /Location: coffee shop/);
    assert.match(userMessage ?? "", /Date history:/);
    assert.match(userMessage ?? "", /Coffee sounds easy/);
  } finally {
    completions.create = originalCreate;
  }
});
