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

export const productFeedback = pgTable("product_feedback", {
  id: serial("id").primaryKey(),
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
