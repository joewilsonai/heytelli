import { jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type ExtractedProfile = {
  job: string | null;
  location: string | null;
  interests: string[];
  mentionedTopics: string[];
  conversationTone: string | null;
};

export const emptyExtractedProfile: ExtractedProfile = {
  job: null,
  location: null,
  interests: [],
  mentionedTopics: [],
  conversationTone: null,
};

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
