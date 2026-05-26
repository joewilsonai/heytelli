CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  email text NOT NULL UNIQUE,
  display_name text,
  role text NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO users (email, display_name, role)
VALUES ('joe@heytelli.local', 'Joe', 'admin')
ON CONFLICT (email) DO NOTHING;

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS user_id integer REFERENCES users(id) ON DELETE CASCADE;

UPDATE matches
SET user_id = (SELECT id FROM users WHERE email = 'joe@heytelli.local')
WHERE user_id IS NULL;

ALTER TABLE matches
  ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS matches_user_id_updated_at_idx
  ON matches (user_id, updated_at DESC);

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS user_id integer REFERENCES users(id) ON DELETE CASCADE;

UPDATE conversations
SET user_id = COALESCE(
  (SELECT user_id FROM matches WHERE matches.id = conversations.match_id),
  (SELECT id FROM users WHERE email = 'joe@heytelli.local')
)
WHERE user_id IS NULL;

ALTER TABLE conversations
  ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS conversations_user_id_created_at_idx
  ON conversations (user_id, created_at DESC);

ALTER TABLE product_feedback
  ADD COLUMN IF NOT EXISTS user_id integer REFERENCES users(id) ON DELETE CASCADE;

UPDATE product_feedback
SET user_id = COALESCE(
  (SELECT user_id FROM matches WHERE matches.id = product_feedback.match_id),
  (SELECT id FROM users WHERE email = 'joe@heytelli.local')
)
WHERE user_id IS NULL;

ALTER TABLE product_feedback
  ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS product_feedback_user_id_created_at_idx
  ON product_feedback (user_id, created_at DESC);
