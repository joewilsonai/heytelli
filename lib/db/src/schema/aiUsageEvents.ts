import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

import { conversations } from "./conversations";
import { matches } from "./matches";
import { users } from "./users";

export type AiUsageFeature =
  | "calm_read"
  | "safety_lens"
  | "dating_clarity_lens"
  | "emotional_pace_lens"
  | "pattern_extraction"
  | "evidence_mapping"
  | "trusted_circle_summary"
  | "date_plan_share"
  | "post_date_debrief"
  | "safety_escalation"
  | "ocr_cleanup"
  | "reply_suggestion"
  | "other";

export type AiUsageProvider =
  | "openai"
  | "anthropic"
  | "openrouter"
  | "litellm"
  | "local"
  | "mock";

export type AiUsageMetadata = Record<string, unknown>;

export const aiUsageEvents = pgTable("ai_usage_events", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  environment: text("environment").notNull().default("development"),
  userId: integer("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  matchId: integer("match_id").references(() => matches.id, {
    onDelete: "set null",
  }),
  conversationId: integer("conversation_id").references(() => conversations.id, {
    onDelete: "set null",
  }),
  feature: text("feature").$type<AiUsageFeature>().notNull(),
  provider: text("provider").$type<AiUsageProvider>().notNull(),
  model: text("model").notNull(),
  requestId: text("request_id"),
  traceId: text("trace_id"),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  cachedInputTokens: integer("cached_input_tokens").notNull().default(0),
  reasoningTokens: integer("reasoning_tokens").notNull().default(0),
  imageTokens: integer("image_tokens").notNull().default(0),
  audioTokens: integer("audio_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  costUsd: numeric("cost_usd", { precision: 12, scale: 6 })
    .notNull()
    .default("0"),
  latencyMs: integer("latency_ms"),
  success: boolean("success").notNull(),
  errorType: text("error_type"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0),
  metadata: jsonb("metadata").$type<AiUsageMetadata>().notNull().default({}),
  promptVersion: text("prompt_version"),
  responseSchemaVersion: text("response_schema_version"),
});

export const insertAiUsageEventSchema = createInsertSchema(
  aiUsageEvents,
).omit({
  id: true,
  createdAt: true,
});

export type AiUsageEvent = typeof aiUsageEvents.$inferSelect;
export type InsertAiUsageEvent = typeof aiUsageEvents.$inferInsert;
