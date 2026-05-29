import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

import { users } from "./users";

export type DateCardStatus =
  | "sent"
  | "viewed"
  | "confirmed"
  | "in_progress"
  | "awaiting_checkin"
  | "overdue"
  | "completed"
  | "expired"
  | "revoked";

export type DateCardDeliveryVia = "native_share" | "sms" | "imessage" | "other";

export type DateCardEventType =
  | "created"
  | "viewed"
  | "confirmed"
  | "revoked"
  | "completed"
  | "expired"
  | "muted";

export const dateCards = pgTable("date_cards", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  clientDateId: text("client_date_id"),
  status: text("status").$type<DateCardStatus>().notNull().default("sent"),
  senderLabel: text("sender_label").notNull(),
  matchFirstName: text("match_first_name"),
  venueLabel: text("venue_label"),
  venueArea: text("venue_area"),
  dateStartAt: timestamp("date_start_at", { withTimezone: true }).notNull(),
  dateEndAt: timestamp("date_end_at", { withTimezone: true }).notNull(),
  checkInAt: timestamp("check_in_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  transportPlan: text("transport_plan"),
  exitPlan: text("exit_plan"),
  codeWordHint: text("code_word_hint"),
  senderNote: text("sender_note"),
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

export const dateCardRecipients = pgTable("date_card_recipients", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id")
    .notNull()
    .references(() => dateCards.id, { onDelete: "cascade" }),
  recipientLabel: text("recipient_label").notNull(),
  relationshipLabel: text("relationship_label"),
  shareTokenHash: text("share_token_hash").notNull().unique(),
  deliveryVia: text("delivery_via")
    .$type<DateCardDeliveryVia>()
    .notNull()
    .default("native_share"),
  viewedAt: timestamp("viewed_at", { withTimezone: true }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  mutedAt: timestamp("muted_at", { withTimezone: true }),
  remindersOptin: boolean("reminders_optin").notNull().default(false),
  remindersContact: text("reminders_contact"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const dateCardEvents = pgTable("date_card_events", {
  id: serial("id").primaryKey(),
  cardId: uuid("card_id")
    .notNull()
    .references(() => dateCards.id, { onDelete: "cascade" }),
  recipientId: uuid("recipient_id").references(() => dateCardRecipients.id, {
    onDelete: "set null",
  }),
  eventType: text("event_type").$type<DateCardEventType>().notNull(),
  idempotencyKey: text("idempotency_key"),
  metadata: jsonb("metadata")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const insertDateCardSchema = createInsertSchema(dateCards).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDateCardRecipientSchema = createInsertSchema(
  dateCardRecipients,
).omit({
  id: true,
  createdAt: true,
});

export const insertDateCardEventSchema = createInsertSchema(
  dateCardEvents,
).omit({
  id: true,
  createdAt: true,
});

export type DateCard = typeof dateCards.$inferSelect;
export type InsertDateCard = typeof dateCards.$inferInsert;
export type DateCardRecipient = typeof dateCardRecipients.$inferSelect;
export type InsertDateCardRecipient = typeof dateCardRecipients.$inferInsert;
export type DateCardEvent = typeof dateCardEvents.$inferSelect;
export type InsertDateCardEvent = typeof dateCardEvents.$inferInsert;
