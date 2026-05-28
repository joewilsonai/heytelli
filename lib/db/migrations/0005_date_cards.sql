CREATE TABLE IF NOT EXISTS date_cards (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id integer NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  state text NOT NULL DEFAULT 'sent',
  shared_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS date_cards_user_id_shared_at_idx
  ON date_cards (user_id, shared_at DESC);

CREATE INDEX IF NOT EXISTS date_cards_match_id_shared_at_idx
  ON date_cards (match_id, shared_at DESC);
