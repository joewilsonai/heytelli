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

test("repairs generic media placeholders before saving transcript context", async () => {
  const { openai } = await import("@workspace/integrations-openai-ai-server");
  const { extractFromScreenshots } = await import("./extraction");

  type CompletionPayload = {
    messages?: Array<{ role: string; content: unknown }>;
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
  const response = (content: unknown): CompletionResponse => ({
    choices: [{ message: { content: JSON.stringify(content) } }],
  });

  completions.create = async (payload) => {
    calls.push(payload);
    if (calls.length === 1) {
      return response({
        suggestedName: "Gretchen",
        vibeTags: ["warm"],
        job: null,
        location: null,
        interests: [],
        mentionedTopics: [],
        conversationTone: "warm and personal",
        visibleMedia: [],
        read: "The conversation has a warm, sharing tone.",
        transcript: [
          { speaker: "her", text: "[photo]" },
          { speaker: "her", text: "This was the view." },
          { speaker: "me", text: "[gif]" },
        ],
        sexPotentialScore: { value: null, rationale: null },
        conversionAbilityScore: { value: null, rationale: null },
        chemistryScore: { value: null, rationale: null },
      });
    }
    return response({
      transcript: [
        {
          speaker: "her",
          text: "[photo: sunset view from a restaurant patio]",
        },
        { speaker: "her", text: "This was the view." },
        {
          speaker: "me",
          text: "[gif: animated thumbs up]",
        },
      ],
      visibleMedia: [
        {
          kind: "photo",
          description: "sunset view from a restaurant patio",
          source: "chat",
          speaker: "her",
        },
        {
          kind: "gif",
          description: "animated thumbs up",
          source: "chat",
          speaker: "me",
        },
      ],
    });
  };

  try {
    const result = await extractFromScreenshots(["data:image/png;base64,AAAA"]);

    assert.equal(calls.length, 2);
    assert.match(
      JSON.stringify(calls[1]?.messages ?? []),
      /generic media placeholders/i,
    );
    assert.deepEqual(result.transcript, [
      {
        speaker: "her",
        text: "[photo: sunset view from a restaurant patio]",
      },
      { speaker: "her", text: "This was the view." },
      {
        speaker: "me",
        text: "[gif: animated thumbs up]",
      },
    ]);
    assert.deepEqual(result.profile.visibleMedia, [
      {
        kind: "photo",
        description: "sunset view from a restaurant patio",
        source: "chat",
        speaker: "her",
      },
      {
        kind: "gif",
        description: "animated thumbs up",
        source: "chat",
        speaker: "me",
      },
    ]);
  } finally {
    completions.create = originalCreate;
  }
});

test("media placeholder repair preserves original text if repair omits a turn", async () => {
  const { openai } = await import("@workspace/integrations-openai-ai-server");
  const { extractFromScreenshots } = await import("./extraction");

  type CompletionPayload = {
    messages?: Array<{ role: string; content: unknown }>;
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
  const response = (content: unknown): CompletionResponse => ({
    choices: [{ message: { content: JSON.stringify(content) } }],
  });
  let calls = 0;

  completions.create = async () => {
    calls += 1;
    if (calls === 1) {
      return response({
        suggestedName: null,
        vibeTags: [],
        visibleMedia: [],
        transcript: [
          { speaker: "her", text: "[photo]" },
          { speaker: "her", text: "This was the view." },
        ],
      });
    }
    return response({
      transcript: [
        {
          speaker: "her",
          text: "[photo: skyline at night]",
        },
      ],
      visibleMedia: [
        {
          kind: "photo",
          description: "skyline at night",
          source: "chat",
          speaker: "her",
        },
      ],
    });
  };

  try {
    const result = await extractFromScreenshots(["data:image/png;base64,AAAA"]);

    assert.deepEqual(result.transcript, [
      { speaker: "her", text: "[photo: skyline at night]" },
      { speaker: "her", text: "This was the view." },
    ]);
  } finally {
    completions.create = originalCreate;
  }
});
