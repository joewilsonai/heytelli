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

test("extraction prompt preserves image-in-image context", async () => {
  const { EXTRACTION_SYSTEM_PROMPT } = await import("./extraction");

  assert.match(EXTRACTION_SYSTEM_PROMPT, /Visible media inside screenshots/);
  assert.match(EXTRACTION_SYSTEM_PROMPT, /screenshot-within-a-screenshot/);
  assert.match(EXTRACTION_SYSTEM_PROMPT, /\[photo: person hiking/);
  assert.match(EXTRACTION_SYSTEM_PROMPT, /\[shared screenshot: restaurant/);
  assert.match(EXTRACTION_SYSTEM_PROMPT, /visibleMedia/);
  assert.match(
    EXTRACTION_SYSTEM_PROMPT,
    /Do not put profile-only visual observations into interests or mentionedTopics/,
  );
  assert.match(
    EXTRACTION_SYSTEM_PROMPT,
    /Do not infer identity, attractiveness, intent, safety, or private facts/,
  );
  assert.match(
    EXTRACTION_SYSTEM_PROMPT,
    /Do not include full names, handles, phone numbers, addresses, license plates/,
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
      visibleMedia: [],
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
      visibleMedia: [
        {
          kind: "profile_photo",
          description: "person at a climbing gym",
          source: "profile",
          speaker: null,
        },
        {
          kind: "profile_photo",
          description: "person at a climbing gym",
          source: "profile",
          speaker: null,
        },
      ],
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
  assert.deepEqual(merged.visibleMedia, [
    {
      kind: "profile_photo",
      description: "person at a climbing gym",
      source: "profile",
      speaker: null,
    },
  ]);
});
