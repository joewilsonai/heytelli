import { integer, pgTable, serial, timestamp } from "drizzle-orm/pg-core";

import { matches } from "./matches";

export const matchScoreHistory = pgTable("match_score_history", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id")
    .notNull()
    .references(() => matches.id, { onDelete: "cascade" }),
  sexPotential: integer("sex_potential"),
  conversionAbility: integer("conversion_ability"),
  chemistry: integer("chemistry"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type MatchScoreHistoryRow = typeof matchScoreHistory.$inferSelect;
