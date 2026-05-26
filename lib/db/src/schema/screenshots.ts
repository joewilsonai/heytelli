import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { matches } from "./matches";

export type ExtractionStatus = "pending" | "done" | "failed";

export const screenshots = pgTable("screenshots", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id")
    .notNull()
    .references(() => matches.id, { onDelete: "cascade" }),
  objectPath: text("object_path"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  extractionStatus: text("extraction_status")
    .$type<ExtractionStatus>()
    .notNull()
    .default("pending"),
  extractionError: text("extraction_error"),
  rawImagePurgedAt: timestamp("raw_image_purged_at", { withTimezone: true }),
});

export const insertScreenshotSchema = createInsertSchema(screenshots).omit({
  id: true,
  uploadedAt: true,
});

export type Screenshot = typeof screenshots.$inferSelect;
export type InsertScreenshot = z.infer<typeof insertScreenshotSchema>;
