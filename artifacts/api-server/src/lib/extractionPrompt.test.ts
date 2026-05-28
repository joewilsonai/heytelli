import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??=
  "postgres://heytelli:heytelli@127.0.0.1:1/heytelli";
process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ??= "http://127.0.0.1:1/openai";
process.env.AI_INTEGRATIONS_OPENAI_API_KEY ??= "test-openai-key";

test("extraction prompt is HeyTelli women-first and not the old male-user framing", async () => {
  const { EXTRACTION_SYSTEM_PROMPT } = await import("./extraction");

  assert.match(
    EXTRACTION_SYSTEM_PROMPT,
    /private dating clarity app for women/i,
  );
  assert.doesNotMatch(EXTRACTION_SYSTEM_PROMPT, /single MALE user/);
  assert.doesNotMatch(
    EXTRACTION_SYSTEM_PROMPT,
    /Likelihood that a first date would lead to sex/,
  );
});

test("extraction prompt keeps deprecated score fields neutral", async () => {
  const { EXTRACTION_SYSTEM_PROMPT } = await import("./extraction");

  assert.match(EXTRACTION_SYSTEM_PROMPT, /Deprecated compatibility fields/i);
  assert.match(
    EXTRACTION_SYSTEM_PROMPT,
    /Return null for value and rationale/i,
  );
});

test("merge extraction clears legacy score values", async () => {
  const { mergeExtraction } = await import("./extraction");

  const merged = mergeExtraction(
    {
      job: null,
      location: null,
      interests: [],
      mentionedTopics: [],
      conversationTone: "warm",
      scores: {
        sexPotential: { value: 9, rationale: "legacy" },
        conversionAbility: { value: 8, rationale: "legacy" },
        chemistry: { value: 7, rationale: "legacy" },
      },
    },
    {
      job: null,
      location: null,
      interests: [],
      mentionedTopics: [],
      conversationTone: "consistent and kind",
      scores: {
        sexPotential: { value: 10, rationale: "ignored" },
        conversionAbility: { value: 10, rationale: "ignored" },
        chemistry: { value: 10, rationale: "ignored" },
      },
    },
  );

  assert.deepEqual(merged.scores, {
    sexPotential: { value: null, rationale: null },
    conversionAbility: { value: null, rationale: null },
    chemistry: { value: null, rationale: null },
  });
});
