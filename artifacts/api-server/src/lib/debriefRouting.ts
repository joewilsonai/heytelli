import type { DateHistoryEntry, MatchReadSnapshot } from "@workspace/db";

export type DebriefSignal = {
  label: string;
  evidence?: string | null;
};

export type DebriefTagSuggestion = {
  tag: string;
  reason?: string | null;
};

export type DebriefDateCandidate = {
  isDate: boolean;
  when: string | null;
  location: string | null;
  recap: string | null;
};

export type DebriefRoutingAnalysis = {
  summary: string;
  vibe: string | null;
  greenFlags: string[];
  redFlags: string[];
  nextMoveSuggestion: string | null;
  tagsToAdd: DebriefTagSuggestion[];
  date: DebriefDateCandidate;
  readUpdate: string | null;
  timelineTitle: string | null;
};

export type DebriefSource = "voice-debrief" | "in-person-recording";

export type PlannedTimelineEvent = {
  matchId: number;
  type:
    | "voice_debrief"
    | "date_debrief"
    | "in_person_recording"
    | "red_flag_seen"
    | "green_flag_seen"
    | "tag_added";
  source: DebriefSource | "ai";
  title: string;
  summary: string | null;
  body: string | null;
  occurredAt: Date;
  metadata: Record<string, unknown>;
};

export type PlannedTagEvent = {
  matchId: number;
  tag: string;
  action: "added";
  source: "ai";
  reason: string | null;
};

export type DebriefPersistencePlan = {
  matchUpdates: {
    tags?: string[];
    dateHistory?: DateHistoryEntry[];
    nextDateAt?: null;
    nextDateLocation?: null;
    lastRead?: MatchReadSnapshot;
  };
  timelineEvents: PlannedTimelineEvent[];
  mainTimelineEvent: PlannedTimelineEvent;
  tagEvents: PlannedTagEvent[];
  redFlagLabels: string[];
  scoreHistory: [];
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toArray(value: string[]): string[] {
  return value.map(cleanText).filter(Boolean).slice(0, 8);
}

export function normalizeDebriefTag(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function validIsoOrNull(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function sourceLabel(source: DebriefSource): string {
  return source === "in-person-recording" ? "in-person recording" : "voice debrief";
}

function buildDebriefBody(input: {
  transcript: string;
  analysis: DebriefRoutingAnalysis;
}): string {
  const analysis = input.analysis;
  return [
    `Summary: ${analysis.summary}`,
    analysis.vibe ? `Vibe: ${analysis.vibe}` : null,
    analysis.greenFlags.length
      ? `What is going well:\n${analysis.greenFlags.map((f) => `- ${f}`).join("\n")}`
      : null,
    analysis.redFlags.length
      ? `Concerns:\n${analysis.redFlags.map((f) => `- ${f}`).join("\n")}`
      : null,
    analysis.nextMoveSuggestion ? `Next move: ${analysis.nextMoveSuggestion}` : null,
    `Transcript:\n${input.transcript}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildDebriefPersistencePlan(input: {
  matchId: number;
  matchName: string;
  source: DebriefSource;
  transcript: string;
  analysis: DebriefRoutingAnalysis;
  addToDateHistory: boolean;
  existingTags: string[];
  existingNotes: string;
  existingDateHistory?: DateHistoryEntry[];
  nextDateAt: Date | string | null;
  nextDateLocation: string | null;
  doneScreenshotCount: number;
  now?: Date;
}): DebriefPersistencePlan {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const analysis = {
    ...input.analysis,
    summary: cleanText(input.analysis.summary) || input.transcript.slice(0, 200),
    vibe: cleanText(input.analysis.vibe) || null,
    greenFlags: toArray(input.analysis.greenFlags),
    redFlags: toArray(input.analysis.redFlags),
    nextMoveSuggestion: cleanText(input.analysis.nextMoveSuggestion) || null,
    readUpdate: cleanText(input.analysis.readUpdate) || null,
    timelineTitle: cleanText(input.analysis.timelineTitle) || null,
  };
  const matchUpdates: DebriefPersistencePlan["matchUpdates"] = {};
  const timelineEvents: PlannedTimelineEvent[] = [];
  const tagEvents: PlannedTagEvent[] = [];

  const existingTags = input.existingTags
    .map(normalizeDebriefTag)
    .filter(Boolean);
  const existingTagSet = new Set(existingTags);
  const nextTags = [...existingTags];
  const seenSuggestions = new Set<string>();
  for (const suggestion of input.analysis.tagsToAdd ?? []) {
    const tag = normalizeDebriefTag(suggestion.tag);
    if (!tag || existingTagSet.has(tag) || seenSuggestions.has(tag)) continue;
    seenSuggestions.add(tag);
    existingTagSet.add(tag);
    nextTags.push(tag);
    const reason = cleanText(suggestion.reason) || null;
    tagEvents.push({
      matchId: input.matchId,
      tag,
      action: "added",
      source: "ai",
      reason,
    });
    timelineEvents.push({
      matchId: input.matchId,
      type: "tag_added",
      source: "ai",
      title: tag,
      summary: reason,
      body: null,
      occurredAt: now,
      metadata: { reason, source: input.source },
    });
  }
  if (tagEvents.length > 0) {
    matchUpdates.tags = nextTags;
  }

  const shouldLogDate = input.addToDateHistory || input.analysis.date?.isDate === true;
  const dateWhen =
    validIsoOrNull(input.analysis.date?.when ?? null) ??
    (input.nextDateAt ? new Date(input.nextDateAt).toISOString() : null) ??
    nowIso;
  const dateLocation =
    cleanText(input.analysis.date?.location) ||
    cleanText(input.nextDateLocation) ||
    "";
  const dateRecap =
    cleanText(input.analysis.date?.recap) ||
    [
      analysis.summary,
      analysis.vibe ? `Vibe: ${analysis.vibe}` : null,
      analysis.nextMoveSuggestion ? `Next: ${analysis.nextMoveSuggestion}` : null,
    ]
      .filter(Boolean)
      .join(" - ");

  if (shouldLogDate) {
    const history = input.existingDateHistory ?? [];
    const newEntry: DateHistoryEntry = {
      id: `${input.source === "in-person-recording" ? "inp" : "vd"}-${now.getTime()}`,
      when: dateWhen,
      location: dateLocation,
      recap: dateRecap,
      createdAt: nowIso,
    };
    matchUpdates.dateHistory = [...history, newEntry];
    if (input.nextDateAt) {
      matchUpdates.nextDateAt = null;
      matchUpdates.nextDateLocation = null;
    }
  }

  if (analysis.readUpdate) {
    matchUpdates.lastRead = {
      body: analysis.readUpdate,
      generatedAt: nowIso,
      screenshotCountAt: input.doneScreenshotCount,
    };
  }

  const mainTimelineEvent: PlannedTimelineEvent = {
    matchId: input.matchId,
    type: shouldLogDate
      ? "date_debrief"
      : input.source === "in-person-recording"
        ? "in_person_recording"
        : "voice_debrief",
    source: input.source,
    title:
      analysis.timelineTitle ??
      (shouldLogDate
        ? `Date debrief with ${input.matchName}`
        : `${sourceLabel(input.source)} with ${input.matchName}`),
    summary: analysis.summary,
    body: buildDebriefBody({ transcript: input.transcript, analysis }),
    occurredAt: shouldLogDate ? new Date(dateWhen) : now,
    metadata: {
      matchName: input.matchName,
      source: input.source,
      vibe: analysis.vibe,
      greenFlags: analysis.greenFlags,
      redFlags: analysis.redFlags,
      nextMoveSuggestion: analysis.nextMoveSuggestion,
      tagsAdded: tagEvents.map((event) => event.tag),
      date: shouldLogDate
        ? { when: dateWhen, location: dateLocation, recap: dateRecap }
        : null,
      readUpdate: analysis.readUpdate,
    },
  };

  timelineEvents.unshift(mainTimelineEvent);
  for (const label of analysis.greenFlags) {
    timelineEvents.push({
      matchId: input.matchId,
      type: "green_flag_seen",
      source: input.source,
      title: label,
      summary: `Captured from ${sourceLabel(input.source)}.`,
      body: null,
      occurredAt: now,
      metadata: { source: input.source, summary: analysis.summary },
    });
  }
  for (const label of analysis.redFlags) {
    timelineEvents.push({
      matchId: input.matchId,
      type: "red_flag_seen",
      source: input.source,
      title: label,
      summary: `Captured from ${sourceLabel(input.source)}.`,
      body: null,
      occurredAt: now,
      metadata: { source: input.source, summary: analysis.summary },
    });
  }

  return {
    matchUpdates,
    timelineEvents,
    mainTimelineEvent,
    tagEvents,
    redFlagLabels: analysis.redFlags,
    scoreHistory: [],
  };
}
