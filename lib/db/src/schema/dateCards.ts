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
import { users } from "./users";

export type DateCardState = "sent" | "revoked" | "home_safe" | "expired";

export type DateCardPayload = {
  matchFirstName: string;
  dateTime: string | null;
  hasVenue: boolean;
  hasTransportPlan: boolean;
  hasCheckIn: boolean;
  hasExpectedEnd: boolean;
  trustedCircleLabels: string[];
  includesCodeWord: boolean;
  includesCircleNote: boolean;
  liveLocationIntent: boolean;
};

export const dateCards = pgTable("date_cards", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  matchId: integer("match_id")
    .notNull()
    .references(() => matches.id, { onDelete: "cascade" }),
  payload: jsonb("payload").$type<DateCardPayload>().notNull(),
  state: text("state").$type<DateCardState>().notNull().default("sent"),
  sharedAt: timestamp("shared_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const insertDateCardSchema = createInsertSchema(dateCards).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DateCard = typeof dateCards.$inferSelect;
export type InsertDateCard = typeof dateCards.$inferInsert;
