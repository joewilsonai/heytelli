CREATE TABLE IF NOT EXISTS date_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_date_id text,
  status text NOT NULL DEFAULT 'sent',
  sender_label text NOT NULL,
  match_first_name text,
  venue_label text,
  venue_area text,
  date_start_at timestamptz NOT NULL,
  date_end_at timestamptz NOT NULL,
  check_in_at timestamptz,
  expires_at timestamptz NOT NULL,
  transport_plan text,
  exit_plan text,
  code_word_hint text,
  sender_note text,
  revoked_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS date_card_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES date_cards(id) ON DELETE CASCADE,
  recipient_label text NOT NULL,
  relationship_label text,
  share_token_hash text NOT NULL UNIQUE,
  delivery_via text NOT NULL DEFAULT 'native_share',
  viewed_at timestamptz,
  confirmed_at timestamptz,
  muted_at timestamptz,
  reminders_optin boolean NOT NULL DEFAULT false,
  reminders_contact text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS date_card_events (
  id bigserial PRIMARY KEY,
  card_id uuid NOT NULL REFERENCES date_cards(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES date_card_recipients(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  idempotency_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(card_id, recipient_id, event_type, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_date_cards_expires_at ON date_cards(expires_at);
CREATE INDEX IF NOT EXISTS idx_date_cards_user_id ON date_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_date_card_events_card_id
  ON date_card_events(card_id);
