import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath, URL as NodeURL } from "node:url";

import {
  buildGutCheckMessage,
  buildGutCheckNoteAppend,
  getGutCheckContextPreview,
  type GutCheckMatch,
} from "./gut-check-card.ts";

const match: GutCheckMatch = {
  name: "Gretchen Moon",
  nextDateAt: "2026-06-01T00:30:00.000Z",
  nextDateLocation: "Louie",
  dateSafetyPlan: {
    trustedCircleName: "Mona, Terry",
  },
  screenshots: [{ objectPath: "screenshots/private-chat.png" }],
  screenshotObjectPath: "screenshots/latest.png",
  transcript: [{ speaker: "match", text: "private transcript" }],
  timelineEvents: [
    {
      id: 1,
      title: "He shared something vulnerable",
      summary: "Talked about family and grief.",
      body: null,
      type: "chat_insight",
      occurredAt: "2026-05-28T13:00:00.000Z",
    },
    {
      id: 2,
      title: "Screenshot imported",
      summary: "Contains raw screenshot context.",
      body: "screenshots/private-chat.png",
      type: "screenshot_import",
      occurredAt: "2026-05-28T14:00:00.000Z",
    },
    {
      id: 3,
      title: "Plans got more specific",
      summary: "Suggested time and place.",
      body: null,
      type: "green_flag_seen",
      occurredAt: "2026-05-28T15:00:00.000Z",
    },
    {
      id: 4,
      title: "Late-night-only texting",
      summary: "Several replies landed after midnight.",
      body: null,
      type: "red_flag_seen",
      occurredAt: "2026-05-28T16:00:00.000Z",
    },
  ],
};

test("builds a privacy-first gut check message for the user's real circle", () => {
  const message = buildGutCheckMessage(match, {
    note: "We shared two deep things and I can't tell if I am overthinking.",
    question: "Does this feel consistent or too fast?",
    includeDate: true,
    includeTimeline: true,
    maskName: false,
  });

  assert.match(message, /^HeyTelli Gut Check/);
  assert.match(message, /About: Gretchen/);
  assert.match(message, /Circle: Mona, Terry/);
  assert.match(message, /What happened:/);
  assert.match(message, /What I want checked:/);
  assert.match(message, /Date: /);
  assert.match(message, /Place: Louie/);
  assert.match(message, /He shared something vulnerable/);
  assert.match(message, /Plans got more specific/);
  assert.match(message, /Late-night-only texting/);
  assert.match(
    message,
    /No screenshots, transcripts, phone numbers, or photos included/,
  );
  assert.doesNotMatch(message, /Moon/);
  assert.doesNotMatch(message, /private transcript/);
  assert.doesNotMatch(message, /screenshots\//);
  assert.doesNotMatch(message, /dangerous|rating|score/i);
});

test("can mask the match name and omit date or timeline context", () => {
  const message = buildGutCheckMessage(match, {
    note: "Need another read.",
    question: "",
    includeDate: false,
    includeTimeline: false,
    maskName: true,
  });

  assert.match(message, /About: Someone/);
  assert.doesNotMatch(message, /Gretchen|Louie|Recent context:/);
});

test("summarizes selectable context without raw screenshots", () => {
  const preview = getGutCheckContextPreview(match);

  assert.deepEqual(preview.timelineHighlights, [
    "Late-night-only texting",
    "Plans got more specific",
    "He shared something vulnerable",
  ]);
  assert.equal(preview.hasDateContext, true);
  assert.equal(preview.circleLabel, "Mona, Terry");
});

test("gut check preview preserves relationship labels for circle contacts", () => {
  const preview = getGutCheckContextPreview({
    ...match,
    dateSafetyPlan: {
      trustedCircleName: "older sister, roommate, best friend",
    },
  });

  assert.equal(preview.circleLabel, "older sister, roommate, best friend");
});

test("builds a private note append after sharing to the user's circle", () => {
  const note = buildGutCheckNoteAppend({
    note: "Mona said to slow down.",
    sharedAt: new Date("2026-05-28T16:00:00.000Z"),
  });

  assert.match(note, /\[Circle Note - Gut Check\]/);
  assert.match(note, /Mona said to slow down\./);
});

test("match screen exposes Gut Check with native share and Circle Note follow-up", () => {
  const screen = readFileSync(
    fileURLToPath(new NodeURL("../app/match/[id].tsx", import.meta.url)),
    "utf8",
  );
  const card = readFileSync(
    fileURLToPath(
      new NodeURL("../components/GutCheckCard.tsx", import.meta.url),
    ),
    "utf8",
  );

  assert.match(screen, /GutCheckCard/);
  assert.match(card, /buildGutCheckMessage/);
  assert.match(card, /Share\.share/);
  assert.match(card, /Circle Note/);
});
