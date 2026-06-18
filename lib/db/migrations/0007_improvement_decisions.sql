ALTER TABLE improvement_work_items
  ADD COLUMN IF NOT EXISTS decision_category text,
  ADD COLUMN IF NOT EXISTS decision_details text,
  ADD COLUMN IF NOT EXISTS decision_reconsider_after_count integer NOT NULL DEFAULT 5;

CREATE INDEX IF NOT EXISTS improvement_work_items_decision_category_idx
  ON improvement_work_items (decision_category, frequency_count DESC)
  WHERE decision_category IS NOT NULL;
