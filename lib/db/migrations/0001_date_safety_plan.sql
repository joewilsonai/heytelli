ALTER TABLE "matches"
  ADD COLUMN IF NOT EXISTS "date_safety_plan" jsonb;
