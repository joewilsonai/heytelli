# Date Card Spec

> **Status:** Canonical V1 spec for the private, expiring Date Card recipient link.
> **Audience:** Engineering, design, founder.
> **Related:** [`docs/safety-roadmap.md`](../safety-roadmap.md) Phase 3.7 + 3.7.2 · [`docs/heytelli-prd.md`](../heytelli-prd.md) Trust Center commitments.

## Purpose

The **Date Card** is HeyTelli's primary out-of-app safety primitive: a polished, time-bounded object the user shares with one or more trusted contacts before a date, so her circle knows where she is, what she's doing, and what to do if she doesn't check in.

It is _not_ a profile, dossier, or message thread about the match. It is a piece of **logistical safety scaffolding**, owned by the sender, addressed to her trusted contact, expiring on its own.

## Design principles

1. **Minimum-viable-information.** Enough for her circle to act if needed; never more. No photos, no chat content, no facts about the match beyond what _she_ chooses to share.
2. **Self-expiring.** Cards are not persistent shared objects. After `date_end + 24h` the URL goes dead.
3. **Recipient-respectful.** The card must be useful to a friend without requiring her to install HeyTelli. Web view must be polished enough to stand alone.
4. **Privacy-by-design.** Opaque tokens, no PII in URLs, no cross-card linkage. The PRD's "make no claims about another person" extends here: the card contains _what she told her friend_, not _what HeyTelli has stored about him_.
5. **Railway-backed, not public.** The shared surface is a private, unlisted, expiring Railway API/web route backed by Railway Postgres. It is not a public profile, hosted dossier, comment thread, or searchable page.
6. **On-brand.** Same cream/plum/coral, same serif headlines, same calm voice as everywhere else.

## What goes on the card

### Always

| Field                                  | Example                                                                                    | Notes                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------ |
| Sender's first name (or chosen handle) | Sarah                                                                                      | She can override with any name |
| Match's first name                     | Mike                                                                                       | First name only, never last    |
| Date + start time                      | Thursday Nov 14, 7:00 PM                                                                   | Local timezone                 |
| Expected end time                      | 10:00 PM                                                                                   | Drives auto-expiry math        |
| Venue name                             | The Library Bar                                                                            | Just the name                  |
| Venue neighborhood                     | Williamsburg                                                                               | Neighborhood, not full address |
| Transportation                         | Uber there, Uber home                                                                      | Free text                      |
| Check-in time                          | 9:00 PM                                                                                    | When she will text             |
| If-not-checked-in instructions         | "Call me at the venue"                                                                     | Free text                      |
| Sender's note                          | "If I don't text by 11pm, please call me. Mike: 28, works at a design agency in Brooklyn." | Free text                      |

### Optional (sender opts in per card)

- **Code word + meaning.** "Marigold = call me with an emergency."
- **Match's age, height, car/license plate.** Anything _she_ knows and wants on file. Default off.
- **Recipient list.** Whether the recipient can see who else got this card (default: visible).

### Deliberately excluded

- Sender's full name, home address, contact details beyond what she chooses
- Match's photo, last name, phone number, employer, social handles
- Any chat content
- Sender's other matches, history, or non-card data

> **Rationale.** Per the PRD's "make no claims about another person" non-negotiable, HeyTelli will not surface AI-derived facts about the match into a card the sender's friend group receives. The card contains _what the sender chose to write_, full stop.

## The two surfaces

### A. Sender view — in the HeyTelli iOS app

Mockup: [`landing/mockups/date-card-sender.html`](../../landing/mockups/date-card-sender.html) (also live at `heytelli.com/mockups/date-card-sender.html`)

Top-level affordances:

- Title: "Date Card"
- Sub-header: the match + when (e.g., "Mike · Thursday 7pm")
- **Status pill row** at top: `Sent` · `Viewed at 2:14pm` · `Confirmed by Anna`
- The **card preview** — exactly what the recipient is seeing
- **Recipients list** with delivery + view + confirm states per recipient
- **Activity timeline** below the card
- **Actions footer**: Edit · Revoke · Share again

State transitions visible to sender:

1. _Draft_ → _Sent_ (the moment she shares)
2. _Sent_ → _Viewed_ (recipient opened URL)
3. _Viewed_ → _Confirmed_ (recipient tapped Got It)
4. _Confirmed_ → _In progress_ (date start time reached)
5. _In progress_ → _Awaiting check-in_ (check-in time passes without ack)
6. _Awaiting_ → _Overdue_ (N minutes past — trigger escalation flow per Phase 4.13)
7. _In progress_ → _Completed_ (sender taps "I'm home")
8. _Completed_ / _Overdue_ → _Expired_ (auto at `date_end + 24h`)

### B. Recipient view — private web link at `/c/:shareToken`

Mockup: [`landing/mockups/date-card-received.html`](../../landing/mockups/date-card-received.html) (also live at `heytelli.com/mockups/date-card-received.html`)

Top-level affordances:

- HeyTelli mark + wordmark (small, top)
- **Greeting**: "Sarah is sharing safety info with you"
- The **card content** — clean, scannable
- **Sender's note** prominently styled
- **Got it** primary CTA
- **Get reminders** optional opt-in (web push or SMS)
- **Live status** at appropriate moments (e.g. "Sarah's check-in time is in 30 minutes")
- **Post-date status** ("Sarah made it home" / "Sarah hasn't checked in")
- **Soft footer**: "HeyTelli helps women stay clear on their own dating. Get yours →"

The recipient view is also the **viral surface** (per [`docs/monetization-thesis.md`](../monetization-thesis.md) Part 8 + Date Card analysis): the page must be polished enough that a friend who has never heard of HeyTelli walks away thinking "I want this for myself," without ever feeling sold to.

V1 can be served by the existing Railway API service at `https://<api-host>/c/:shareToken` to avoid a second deployable. A later `card.heytelli.com` or `heytelli.com/c/:shareToken` route is fine once DNS and routing are ready.

## Lifecycle state machine

```
DRAFT
  └─ (sender shares) ──> SENT
                            │
                            ├─ (recipient opens URL) ──> VIEWED
                            │                              │
                            │                              ├─ (recipient acks) ──> CONFIRMED
                            │                              │                          │
                            │                              │                          ↓
                            │                              │                  (date start time)
                            │                              │                          │
                            │                              │                          ↓
                            │                              │                    IN_PROGRESS
                            │                              │                          │
                            │                              │            ┌─────────────┴─────────────┐
                            │                              │            │                           │
                            │                              │   (check-in time passes      (sender confirms home)
                            │                              │    without ack)                        │
                            │                              │            │                           ↓
                            │                              │            ↓                       COMPLETED
                            │                              │       AWAITING_CHECKIN                 │
                            │                              │            │                           ↓
                            │                              │            │                       EXPIRED (date_end + 24h)
                            │                              │   (N minutes past — escalate)
                            │                              │            │
                            │                              │            ↓
                            │                              │         OVERDUE → triggers Phase 4.13
                            │                              │
  ── (sender revokes any time) ────────────────────────────┼──> REVOKED
                                                           │
                                                           └─ (auto at date_end + 24h) ──> EXPIRED
```

## Privacy contract

- **Token**: server-generated, high-entropy, recipient-scoped share token. Store only a hash server-side.
- **URL**: `https://<api-host>/c/<shareToken>` for V1, later `https://card.heytelli.com/<shareToken>` or `https://heytelli.com/c/<shareToken>`. No identifying info in the URL.
- **Expiry**: `date_end + 24h`. Hard auto-delete; record marked `revoked_at` set to NOW.
- **Sender revocation**: one tap, anywhere in card lifecycle.
- **Recipient view scope**: only this card. The recipient never sees other matches, prior cards, sender's history, or any cross-card state.
- **Recipient mute**: a "stop receiving cards from this sender" option. Honored permanently. Sender sees only "muted" status; we never reveal _why_.
- **No analytics-side identity linkage**: card → signup attribution is anonymous (the recipient's later install isn't linked to her recipient-of-Sarah's-card status in any queryable way).
- **No hosted media**: raw screenshots, profile photos, transcripts, and chat exports are never stored for the Date Card link.
- **No server-side match ID**: the shared-card records must not store `match_id`. The mobile app can map local date cards back to a match locally.

## Railway storage model (V1)

The card lives in Railway Postgres as structured, minimum-viable safety data. The browser never reads Postgres directly; the Railway API/web route validates the share token, reads the safe card record server-side, writes recipient events, and renders/returns the recipient page.

```sql
CREATE TABLE date_cards (
  id                 UUID PRIMARY KEY,
  user_id            INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_date_id     TEXT,                         -- local/mobile correlation only
  status             TEXT NOT NULL DEFAULT 'sent',  -- see state machine
  sender_label       TEXT NOT NULL,
  match_first_name   TEXT,
  venue_label        TEXT,
  venue_area         TEXT,
  date_start_at      TIMESTAMPTZ NOT NULL,
  date_end_at        TIMESTAMPTZ NOT NULL,
  check_in_at        TIMESTAMPTZ,
  expires_at         TIMESTAMPTZ NOT NULL,          -- date_end_at + 24h
  transport_plan     TEXT,
  exit_plan          TEXT,
  code_word_hint     TEXT,
  sender_note        TEXT,
  revoked_at         TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE date_card_recipients (
  id                 UUID PRIMARY KEY,
  card_id            UUID NOT NULL REFERENCES date_cards(id) ON DELETE CASCADE,
  recipient_label    TEXT NOT NULL,               -- "Anna" or "Sister"
  relationship_label TEXT,                        -- "best friend", "roommate", optional
  share_token_hash   TEXT NOT NULL UNIQUE,
  delivery_via       TEXT NOT NULL,               -- 'sms' | 'imessage' | 'native_share' | 'other'
  viewed_at          TIMESTAMPTZ,
  confirmed_at       TIMESTAMPTZ,
  muted_at           TIMESTAMPTZ,
  reminders_optin    BOOLEAN NOT NULL DEFAULT FALSE,
  reminders_contact  TEXT,                        -- nullable; only if recipient opts in
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE date_card_events (
  id              BIGSERIAL PRIMARY KEY,
  card_id         UUID NOT NULL REFERENCES date_cards(id) ON DELETE CASCADE,
  recipient_id    UUID REFERENCES date_card_recipients(id) ON DELETE SET NULL,
  event_type      TEXT NOT NULL,                  -- created, viewed, confirmed, revoked, completed, expired
  idempotency_key TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(card_id, recipient_id, event_type, idempotency_key)
);

CREATE INDEX idx_date_cards_expires_at ON date_cards(expires_at);
CREATE INDEX idx_date_cards_user_id ON date_cards(user_id);
CREATE INDEX idx_date_card_events_card_id ON date_card_events(card_id);
```

> The recipient contact info (phone/email for reminders) is **stored only if the recipient opts in** to reminders. It is never stored for the act of receiving the card itself — that path requires no PII on our side.

## API surface (V1)

```
POST   /api/date-cards                    → sender creates card, returns recipient share links
GET    /api/date-cards                    → sender lists her active/past cards
GET    /api/date-cards/:id                → sender fetches card + recipient statuses
POST   /api/date-cards/:id/revoke         → sender revokes
POST   /api/date-cards/:id/complete       → sender marks home safe
GET    /c/:shareToken                     → recipient card page, no account required
POST   /api/date-card-shares/:shareToken/view     → mark viewed, idempotent
POST   /api/date-card-shares/:shareToken/confirm  → recipient taps Got it
POST   /api/date-card-shares/:shareToken/mute     → recipient mutes future reminder attempts
```

Sender-authenticated endpoints require the user's app session. Recipient endpoints require only the share token, are rate-limited, and return nothing about other cards or matches.

## Rollout order

1. **Process fix:** blocked recovery issues must create executable `risk:extra_agent_review` work, not dead-end `risk:no_auto_merge` work.
2. **Backend:** add Railway Postgres tables, token hashing, expiry/revoke logic, and recipient event APIs.
3. **Mobile:** Date Plan editor creates/syncs a Date Card, lets her pick up to 3 circle recipients, and shares private links via the native share sheet.
4. **Recipient web:** render `/c/:shareToken` with first names/logistics/status, plus "Got it" and "Text her" actions.
5. **Sender status:** app shows Sent, Viewed, Confirmed, Overdue, Home Safe, Revoked, and Expired; date timeline records card shared/viewed/confirmed/completed.
6. **Verification:** focused tests for no screenshots, no transcripts, no `match_id`, no recipient PII by default, expiry, revocation, idempotent events, and stale-token behavior.

### V1 implementation checkpoint - 2026-05-29

- Schema and migration: `date_cards`, `date_card_recipients`, and `date_card_events`.
- API: `/api/date-cards`, `/api/date-cards/:id`, revoke/complete, and `/api/date-card-shares/:shareToken/view|confirm|mute`.
- Recipient web: `/c/:shareToken` renders the private card and posts Got it back to the API.
- Mobile: Share Date Card creates private links first, shares through the native sheet, records the local share event, and reloads circle link status.
- Privacy guardrails: first names/labels only, token hashes server-side, no raw screenshots, no transcripts, no profile photos, no server-side `match_id`, no recipient phone/email unless a future reminders opt-in explicitly asks for it.

## Visual design tokens

- Background: cream `#FAF7F3`
- Surface (card): white `#FFFFFF`
- Border: `#E7E0D8`
- Ink: deep plum `#2E2632`
- Muted text: `#756E78`
- Accent / CTA: terracotta `#E07A5F`
- Accent hover: `#CF6549`
- Success: `#3F7D5B`
- Warning: `#B4543E`
- Headline font: ui-serif / Georgia / Times New Roman
- Body font: -apple-system / SF Pro / system sans
- Border radius: 14–16px (matches landing page)
- Spacing: generous — section gaps 24–32px, line-height 1.6

## What this spec does _not_ cover

- iMessage rich preview / Universal Link `apple-app-site-association` plumbing — separate spec when implementation begins.
- Server-side OG image rendering (for nice link previews). Out of scope here.
- Stripe / Apple IAP gating around any Date Card feature. **Per the monetization thesis: Date Cards stay in the free tier permanently** — they are the viral surface and the most important pricing decision.
- The "I'm home" debrief flow that lives downstream of _Completed_ state.
