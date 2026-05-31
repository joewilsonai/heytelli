CREATE TABLE IF NOT EXISTS improvement_signals (
  id serial PRIMARY KEY,
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  match_id integer REFERENCES matches(id) ON DELETE SET NULL,
  source text NOT NULL,
  severity text NOT NULL DEFAULT 'low',
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  sanitized_summary text,
  sanitized_payload jsonb,
  privacy_risk text NOT NULL DEFAULT 'low',
  fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS improvement_signals_status_created_at_idx
  ON improvement_signals (status, created_at DESC);

CREATE INDEX IF NOT EXISTS improvement_signals_fingerprint_idx
  ON improvement_signals (fingerprint);

CREATE INDEX IF NOT EXISTS improvement_signals_user_id_created_at_idx
  ON improvement_signals (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS improvement_work_items (
  id serial PRIMARY KEY,
  fingerprint text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  category text NOT NULL,
  priority text NOT NULL DEFAULT 'p3',
  risk_tier text NOT NULL DEFAULT 'safe_auto_merge',
  impact_score integer NOT NULL DEFAULT 1,
  confidence_score integer NOT NULL DEFAULT 1,
  frequency_count integer NOT NULL DEFAULT 1,
  signal_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  github_issue_url text,
  github_issue_number integer,
  branch_name text,
  pull_request_url text,
  pull_request_number integer,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS improvement_work_items_status_priority_idx
  ON improvement_work_items (status, priority, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS improvement_work_items_fingerprint_idx
  ON improvement_work_items (fingerprint);

CREATE INDEX IF NOT EXISTS improvement_work_items_github_issue_number_idx
  ON improvement_work_items (github_issue_number);

CREATE TABLE IF NOT EXISTS improvement_runs (
  id serial PRIMARY KEY,
  work_item_id integer NOT NULL REFERENCES improvement_work_items(id) ON DELETE CASCADE,
  run_type text NOT NULL,
  agent_name text NOT NULL,
  status text NOT NULL,
  summary text NOT NULL,
  logs_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS improvement_runs_work_item_id_created_at_idx
  ON improvement_runs (work_item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS improvement_trace_spans (
  id serial PRIMARY KEY,
  work_item_id integer REFERENCES improvement_work_items(id) ON DELETE CASCADE,
  run_id integer REFERENCES improvement_runs(id) ON DELETE SET NULL,
  trace_id text NOT NULL,
  span_id text NOT NULL,
  parent_span_id text,
  name text NOT NULL,
  kind text NOT NULL,
  agent_name text,
  status text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_summary text,
  duration_ms integer,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS improvement_trace_spans_trace_id_started_at_idx
  ON improvement_trace_spans (trace_id, started_at DESC);

CREATE INDEX IF NOT EXISTS improvement_trace_spans_work_item_id_started_at_idx
  ON improvement_trace_spans (work_item_id, started_at DESC);
