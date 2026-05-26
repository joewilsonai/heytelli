import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

import { matches } from "./matches";

export type RedFlagEventSource =
  | "radar"
  | "voice-debrief"
  | "in-person-recording";

export type RedFlagSeverity = "low" | "medium" | "high";

export const matchRedFlagEvents = pgTable("match_red_flag_events", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id")
    .notNull()
    .references(() => matches.id, { onDelete: "cascade" }),
  source: text("source").$type<RedFlagEventSource>().notNull(),
  runId: text("run_id").notNull(),
  severity: text("severity").$type<RedFlagSeverity>().notNull(),
  label: text("label").notNull(),
  evidence: text("evidence").notNull(),
  fingerprint: text("fingerprint").notNull(),
  contextHash: text("context_hash").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const insertMatchRedFlagEventSchema = createInsertSchema(
  matchRedFlagEvents,
).omit({
  id: true,
  createdAt: true,
});

export type MatchRedFlagEvent = typeof matchRedFlagEvents.$inferSelect;
export type InsertMatchRedFlagEvent = typeof matchRedFlagEvents.$inferInsert;
