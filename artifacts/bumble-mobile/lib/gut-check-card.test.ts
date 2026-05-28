import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath, URL as NodeURL } from "node:url";

import {
  buildGutCheckMoments,
  buildGutCheckMessage,
  buildGutCheckNoteAppend,
  getGutCheckContextPreview,
  type GutCheckMatch,
} from "./gut-check-card.ts";

const match: GutCheckMatch = {
  name: "Gretchen Moon",
  tags: ["slow burn", "boundary check"],
  vibeTags: ["Warm but uneven"],
  overallRead: "There is real openness here, but the cadence is inconsistent.",
  nextDateAt: "2026-06-01T00:30:00.000Z",
  nextDateLocation: "Louie",
  dateSafetyPlan: {
    trustedCircleName: "Mona, Terry",
  },
  redFlags: [
    {
      severity: "medium",
      label: "Late-night-only texting",
      evidence: "Several replies landed after midnight.",
      status: "current",
    },
  ],
  currentRedFlags: [
    {
      severity: "medium",
      label: "Late-night-only texting",
      evidence: "Several replies landed after midnight.",
      status: "current",
    },
  ],
  historicalRedFlags: [
    {
      severity: "low",
      label: "Slow to make a plan",
      evidence: "Plans were vague until the last exchange.",
      status: "previously-seen",
    },
  ],
  greenFlags: [
    {
      label: "Shared something vulnerable",
      evidence: "Talked about family and grief without pushing for intimacy.",
    },
  ],
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

test("builds selectable gut check moments from analyzed context without overriding her instinct", () => {
  const moments = buildGutCheckMoments(match);

  assert.equal(moments[0]?.id, "manual-instinct");
  assert.equal(moments[0]?.title, "Something feels off");
  assert.equal(moments[0]?.kind, "manual");
  assert.match(moments[0]?.suggestedQuestion ?? "", /trust my read/i);

  const redFlag = moments.find((moment) => moment.id === "red-flag-0");
  assert.equal(redFlag?.kind, "pattern");
  assert.equal(redFlag?.label, "Pattern");
  assert.equal(redFlag?.title, "Late-night-only texting");
  assert.match(redFlag?.evidence ?? "", /after midnight/);

  const greenFlag = moments.find((moment) => moment.id === "green-flag-0");
  assert.equal(greenFlag?.kind, "green-flag");
  assert.equal(greenFlag?.label, "Green flag");

  const timeline = moments.find((moment) => moment.id === "timeline-4");
  assert.equal(timeline?.title, "Late-night-only texting");
  assert.equal(
    moments.some((moment) => /screenshot imported/i.test(moment.title)),
    false,
  );
  assert.equal(
    moments.some((moment) =>
      /private transcript|screenshots\//i.test(moment.evidence ?? ""),
    ),
    false,
  );
});

test("builds a privacy-first gut check message for the user's real circle", () => {
  const selectedMoment = buildGutCheckMoments(match).find(
    (moment) => moment.id === "red-flag-0",
  );
  assert.ok(selectedMoment);

  const message = buildGutCheckMessage(match, {
    selectedMoment,
    note: "We shared two deep things and I can't tell if I am overthinking.",
    question: "Does this feel consistent or too fast?",
    includeDate: true,
    includeTimeline: true,
    maskName: false,
  });

  assert.match(message, /^HeyTelli Gut Check/);
  assert.match(message, /About: Gretchen/);
  assert.match(message, /Circle: Mona, Terry/);
  assert.match(message, /Gut check item:/);
  assert.match(message, /Pattern: Late-night-only texting/);
  assert.match(message, /Why it stood out:/);
  assert.match(message, /Several replies landed after midnight/);
  assert.match(message, /My instinct:/);
  assert.match(message, /What I want from you:/);
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
    selectedMoment: buildGutCheckMoments(match)[0],
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
  assert.match(card, /buildGutCheckMoments/);
  assert.match(card, /selectedMoment/);
  assert.match(card, /Something\s+feels off/);
  assert.match(card, /buildGutCheckMessage/);
  assert.match(card, /Share\.share/);
  assert.match(card, /Circle Note/);
});
