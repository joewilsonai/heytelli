CREATE TABLE IF NOT EXISTS "ai_usage_events" (
  "id" serial PRIMARY KEY,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "environment" text DEFAULT 'development' NOT NULL,
  "user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "match_id" integer REFERENCES "matches"("id") ON DELETE SET NULL,
  "conversation_id" integer REFERENCES "conversations"("id") ON DELETE SET NULL,
  "feature" text NOT NULL,
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "request_id" text,
  "trace_id" text,
  "input_tokens" integer DEFAULT 0 NOT NULL,
  "output_tokens" integer DEFAULT 0 NOT NULL,
  "cached_input_tokens" integer DEFAULT 0 NOT NULL,
  "reasoning_tokens" integer DEFAULT 0 NOT NULL,
  "image_tokens" integer DEFAULT 0 NOT NULL,
  "audio_tokens" integer DEFAULT 0 NOT NULL,
  "total_tokens" integer DEFAULT 0 NOT NULL,
  "cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
  "latency_ms" integer,
  "success" boolean NOT NULL,
  "error_type" text,
  "error_message" text,
  "retry_count" integer DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "prompt_version" text,
  "response_schema_version" text
);

CREATE INDEX IF NOT EXISTS "ai_usage_events_created_at_idx"
  ON "ai_usage_events" ("created_at" DESC);

CREATE INDEX IF NOT EXISTS "ai_usage_events_user_created_at_idx"
  ON "ai_usage_events" ("user_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "ai_usage_events_match_created_at_idx"
  ON "ai_usage_events" ("match_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "ai_usage_events_feature_created_at_idx"
  ON "ai_usage_events" ("feature", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "ai_usage_events_provider_model_created_at_idx"
  ON "ai_usage_events" ("provider", "model", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "ai_usage_events_success_created_at_idx"
  ON "ai_usage_events" ("success", "created_at" DESC);
