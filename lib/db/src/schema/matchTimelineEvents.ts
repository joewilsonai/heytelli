import {
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

import { matches } from "./matches";

export type MatchTimelineEventType =
  | "voice_debrief"
  | "date_debrief"
  | "in_person_recording"
  | "manual_note"
  | "screenshot_import"
  | "chat_insight"
  | "red_flag_seen"
  | "green_flag_seen"
  | "tag_added"
  | "tag_removed";

export type MatchTimelineEventSource =
  | "user"
  | "ai"
  | "voice-debrief"
  | "in-person-recording"
  | "chat";

export const matchTimelineEvents = pgTable("match_timeline_events", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id")
    .notNull()
    .references(() => matches.id, { onDelete: "cascade" }),
  type: text("type").$type<MatchTimelineEventType>().notNull(),
  source: text("source").$type<MatchTimelineEventSource>().notNull(),
  title: text("title").notNull(),
  summary: text("summary"),
  body: text("body"),
  metadata: jsonb("metadata")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const insertMatchTimelineEventSchema = createInsertSchema(
  matchTimelineEvents,
).omit({
  id: true,
  createdAt: true,
});

export type MatchTimelineEvent = typeof matchTimelineEvents.$inferSelect;
export type InsertMatchTimelineEvent =
  typeof matchTimelineEvents.$inferInsert;
