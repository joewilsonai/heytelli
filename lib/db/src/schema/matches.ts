import { jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type MatchScore = {
  value: number | null;
  rationale: string | null;
};

export type MatchScores = {
  sexPotential: MatchScore;
  conversionAbility: MatchScore;
  chemistry: MatchScore;
};

export const emptyScore: MatchScore = { value: null, rationale: null };

export const emptyScores: MatchScores = {
  sexPotential: emptyScore,
  conversionAbility: emptyScore,
  chemistry: emptyScore,
};

export type ExtractedProfile = {
  job: string | null;
  location: string | null;
  interests: string[];
  mentionedTopics: string[];
  conversationTone: string | null;
  scores: MatchScores;
};

export const emptyExtractedProfile: ExtractedProfile = {
  job: null,
  location: null,
  interests: [],
  mentionedTopics: [],
  conversationTone: null,
  scores: emptyScores,
};

export type TranscriptTurn = {
  speaker: "her" | "me";
  text: string;
};

export const emptyTranscript: TranscriptTurn[] = [];

export type DateHistoryEntry = {
  id: string;
  /** ISO timestamp of when the date actually happened. */
  when: string;
  location: string;
  recap: string;
  /** ISO timestamp of when the entry was logged. */
  createdAt: string;
};

export const emptyDateHistory: DateHistoryEntry[] = [];

function toIsoString(v: unknown): string | null {
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? null : v.toISOString();
  }
  if (typeof v === "string" && v) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

export function normalizeDateHistory(input: unknown): DateHistoryEntry[] {
  if (!Array.isArray(input)) return [];
  const out: DateHistoryEntry[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const obj = raw as Record<string, unknown>;
    const id = typeof obj.id === "string" && obj.id ? obj.id : null;
    const when = toIsoString(obj.when);
    if (!id || !when) continue;
    out.push({
      id,
      when,
      location: typeof obj.location === "string" ? obj.location : "",
      recap: typeof obj.recap === "string" ? obj.recap : "",
      createdAt: toIsoString(obj.createdAt) ?? new Date().toISOString(),
    });
  }
  return out;
}

export function normalizeTranscript(input: unknown): TranscriptTurn[] {
  if (!Array.isArray(input)) return [];
  const out: TranscriptTurn[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const obj = raw as Record<string, unknown>;
    const speaker = obj.speaker === "her" || obj.speaker === "me" ? obj.speaker : null;
    const text = typeof obj.text === "string" ? obj.text.trim() : "";
    if (!speaker || !text) continue;
    out.push({ speaker, text });
  }
  return out;
}

function normalizeScore(input: unknown): MatchScore {
  if (!input || typeof input !== "object") return { ...emptyScore };
  const obj = input as Record<string, unknown>;
  const raw = obj.value;
  let value: number | null = null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    value = Math.max(0, Math.min(10, Math.round(raw)));
  }
  const rationale =
    typeof obj.rationale === "string" && obj.rationale.trim() !== ""
      ? obj.rationale.trim()
      : null;
  return { value, rationale };
}

export function normalizeExtractedProfile(
  input: unknown,
): ExtractedProfile {
  const obj = (input ?? {}) as Record<string, unknown>;
  const incomingScores = (obj.scores ?? {}) as Record<string, unknown>;
  return {
    job: typeof obj.job === "string" ? obj.job : null,
    location: typeof obj.location === "string" ? obj.location : null,
    interests: Array.isArray(obj.interests)
      ? obj.interests.filter((v): v is string => typeof v === "string")
      : [],
    mentionedTopics: Array.isArray(obj.mentionedTopics)
      ? obj.mentionedTopics.filter((v): v is string => typeof v === "string")
      : [],
    conversationTone:
      typeof obj.conversationTone === "string" ? obj.conversationTone : null,
    scores: {
      sexPotential: normalizeScore(incomingScores.sexPotential),
      conversionAbility: normalizeScore(incomingScores.conversionAbility),
      chemistry: normalizeScore(incomingScores.chemistry),
    },
  };
}

export type MatchStatus = "active" | "archived" | "ghosted";

export const matches = pgTable("matches", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  photoObjectPath: text("photo_object_path"),
  status: text("status").$type<MatchStatus>().notNull().default("active"),
  vibeTags: text("vibe_tags").array().notNull().default([]),
  extractedProfile: jsonb("extracted_profile")
    .$type<ExtractedProfile>()
    .notNull()
    .default(emptyExtractedProfile),
  transcript: jsonb("transcript")
    .$type<TranscriptTurn[]>()
    .notNull()
    .default(emptyTranscript),
  notes: text("notes").notNull().default(""),
  nextDateAt: timestamp("next_date_at", { withTimezone: true }),
  nextDateLocation: text("next_date_location"),
  nextDateOutfit: text("next_date_outfit"),
  tags: text("tags").array().notNull().default([]),
  dateHistory: jsonb("date_history")
    .$type<DateHistoryEntry[]>()
    .notNull()
    .default(emptyDateHistory),
  lastDateBrief: jsonb("last_date_brief").$type<{
    brief: string;
    generatedAt: string;
    screenshotCountAt: number;
  } | null>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const insertMatchSchema = createInsertSchema(matches).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Match = typeof matches.$inferSelect;
export type InsertMatch = z.infer<typeof insertMatchSchema>;
