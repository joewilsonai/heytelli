CREATE TABLE IF NOT EXISTS "product_feedback" (
  "id" serial PRIMARY KEY,
  "match_id" integer REFERENCES "matches"("id") ON DELETE SET NULL,
  "event" text NOT NULL,
  "answer" text NOT NULL,
  "context" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
