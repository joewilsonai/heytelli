import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

import { matches } from "./matches";

export type TagEventAction = "added" | "removed";
export type TagEventSource = "user" | "ai";

export const matchTagEvents = pgTable("match_tag_events", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id")
    .notNull()
    .references(() => matches.id, { onDelete: "cascade" }),
  tag: text("tag").notNull(),
  action: text("action").$type<TagEventAction>().notNull(),
  source: text("source").$type<TagEventSource>().notNull().default("user"),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type MatchTagEvent = typeof matchTagEvents.$inferSelect;
