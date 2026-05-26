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

export const productFeedback = pgTable("product_feedback", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  matchId: integer("match_id").references(() => matches.id, {
    onDelete: "set null",
  }),
  event: text("event").notNull(),
  answer: text("answer").notNull(),
  context: jsonb("context")
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const insertProductFeedbackSchema = createInsertSchema(
  productFeedback,
).omit({
  id: true,
  createdAt: true,
});

export type ProductFeedback = typeof productFeedback.$inferSelect;
export type InsertProductFeedback = typeof productFeedback.$inferInsert;
