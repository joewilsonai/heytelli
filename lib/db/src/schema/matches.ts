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

export const matches = pgTable("matches", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  photoObjectPath: text("photo_object_path"),
  vibeTags: text("vibe_tags").array().notNull().default([]),
  extractedProfile: jsonb("extracted_profile")
    .$type<ExtractedProfile>()
    .notNull()
    .default(emptyExtractedProfile),
  notes: text("notes").notNull().default(""),
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
