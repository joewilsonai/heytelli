# Date Card Spec

> **Status:** Design spec for the Date Card primitive.
> **Audience:** Engineering, design, founder.
> **Related:** [`docs/safety-roadmap.md`](../safety-roadmap.md) Phase 3.7 + 3.7.2 · [`docs/heytelli-prd.md`](../heytelli-prd.md) Trust Center commitments.

## Purpose

The **Date Card** is HeyTelli's primary out-of-app safety primitive: a polished, time-bounded object the user shares with one or more trusted contacts before a date, so her circle knows where she is, what she's doing, and what to do if she doesn't check in.

It is *not* a profile, dossier, or message thread about the match. It is a piece of **logistical safety scaffolding**, owned by the sender, addressed to her trusted contact, expiring on its own.

## Design principles

1. **Minimum-viable-information.** Enough for her circle to act if needed; never more. No photos, no chat content, no facts about the match beyond what *she* chooses to share.
2. **Self-expiring.** Cards are not persistent shared objects. After `date_end + 24h` the URL goes dead.
3. **Recipient-respectful.** The card must be useful to a friend without requiring her to install HeyTelli. Web view must be polished enough to stand alone.
4. **Privacy-by-design.** Opaque tokens, no PII in URLs, no cross-card linkage. The PRD's "make no claims about another person" extends here: the card contains *what she told her friend*, not *what HeyTelli has stored about him*.
5. **On-brand.** Same cream/plum/coral, same serif headlines, same calm voice as everywhere else.

## What goes on the card

### Always

| Field | Example | Notes |
|---|---|---|
| Sender's first name (or chosen handle) | Sarah | She can override with any name |
| Match's first name | Mike | First name only, never last |
| Date + start time | Thursday Nov 14, 7:00 PM | Local timezone |
| Expected end time | 10:00 PM | Drives auto-expiry math |
| Venue name | The Library Bar | Just the name |
| Venue neighborhood | Williamsburg | Neighborhood, not full address |
| Transportation | Uber there, Uber home | Free text |
| Check-in time | 9:00 PM | When she will text |
| If-not-checked-in instructions | "Call me at the venue" | Free text |
| Sender's note | "If I don't text by 11pm, please call me. Mike: 28, works at a design agency in Brooklyn." | Free text |

### Optional (sender opts in per card)

- **Code word + meaning.** "Marigold = call me with an emergency."
- **Match's age, height, car/license plate.** Anything *she* knows and wants on file. Default off.
- **Recipient list.** Whether the recipient can see who else got this card (default: visible).

### Deliberately excluded

- Sender's full name, home address, contact details beyond what she chooses
- Match's photo, last name, phone number, employer, social handles
- Any chat content
- Sender's other matches, history, or non-card data

> **Rationale.** Per the PRD's "make no claims about another person" non-negotiable, HeyTelli will not surface AI-derived facts about the match into a card the sender's friend group receives. The card contains *what the sender chose to write*, full stop.

## The two surfaces

### A. Sender view — in the HeyTelli iOS app

Mockup: [`docs/mockups/date-card-sender.html`](../mockups/date-card-sender.html)

Top-level affordances:
- Title: "Date Card"
- Sub-header: the match + when (e.g., "Mike · Thursday 7pm")
- **Status pill row** at top: `Sent` · `Viewed at 2:14pm` · `Confirmed by Anna`
- The **card preview** — exactly what the recipient is seeing
- **Recipients list** with delivery + view + confirm states per recipient
- **Activity timeline** below the card
- **Actions footer**: Edit · Revoke · Share again

State transitions visible to sender:
1. *Draft* → *Sent* (the moment she shares)
2. *Sent* → *Viewed* (recipient opened URL)
3. *Viewed* → *Confirmed* (recipient tapped Got It)
4. *Confirmed* → *In progress* (date start time reached)
5. *In progress* → *Awaiting check-in* (check-in time passes without ack)
6. *Awaiting* → *Overdue* (N minutes past — trigger escalation flow per Phase 4.13)
7. *In progress* → *Completed* (sender taps "I'm home")
8. *Completed* / *Overdue* → *Expired* (auto at `date_end + 24h`)

### B. Recipient view — web at `card.heytelli.com/<token>`

Mockup: [`docs/mockups/date-card-received.html`](../mockups/date-card-received.html)

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

- **Token**: UUIDv4 generated server-side. Opaque, non-enumerable.
- **URL**: `https://card.heytelli.com/<token>` (or `heytelli.com/c/<token>` for simpler DNS). No identifying info in the URL.
- **Expiry**: `date_end + 24h`. Hard auto-delete; record marked `revoked_at` set to NOW.
- **Sender revocation**: one tap, anywhere in card lifecycle.
- **Recipient view scope**: only this card. The recipient never sees other matches, prior cards, sender's history, or any cross-card state.
- **Recipient mute**: a "stop receiving cards from this sender" option. Honored permanently. Sender sees only "muted" status; we never reveal *why*.
- **No analytics-side identity linkage**: card → signup attribution is anonymous (the recipient's later install isn't linked to her recipient-of-Sarah's-card status in any queryable way).

## Data model (proposed)

```sql
CREATE TABLE date_cards (
  id            UUID PRIMARY KEY,                -- the opaque token (and primary key)
  user_id       INT  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id      INT      REFERENCES matches(id) ON DELETE SET NULL,
  payload       JSONB NOT NULL,                  -- see Always + Optional fields above
  date_start_at TIMESTAMPTZ NOT NULL,
  date_end_at   TIMESTAMPTZ NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,            -- date_end_at + 24h
  revoked_at    TIMESTAMPTZ,
  state         TEXT NOT NULL DEFAULT 'sent',    -- see state machine
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE date_card_recipients (
  id           SERIAL PRIMARY KEY,
  card_id      UUID NOT NULL REFERENCES date_cards(id) ON DELETE CASCADE,
  contact_label TEXT NOT NULL,                   -- "Anna" — recipient-friendly, no identity inference
  delivery_via TEXT NOT NULL,                    -- 'sms' | 'imessage' | 'web' | 'other'
  viewed_at    TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  muted_at     TIMESTAMPTZ,
  reminders_optin BOOLEAN NOT NULL DEFAULT FALSE,
  reminders_contact TEXT,                        -- nullable; only if recipient opted in
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_date_cards_expires_at ON date_cards(expires_at);
CREATE INDEX idx_date_cards_user_id ON date_cards(user_id);
```

> The recipient contact info (phone/email for reminders) is **stored only if the recipient opts in** to reminders. It is never stored for the act of receiving the card itself — that path requires no PII on our side.

## API surface (proposed)

```
POST   /api/date-cards              → create card, returns { id, url }
GET    /api/date-cards/:token       → fetch card payload + state (no auth required, rate-limited)
POST   /api/date-cards/:token/view  → mark viewed (idempotent)
POST   /api/date-cards/:token/confirm → recipient ack
POST   /api/date-cards/:token/mute  → recipient mute future
POST   /api/date-cards/:id/revoke   → sender revokes (auth required)
POST   /api/date-cards/:id/complete → sender marks home safe
```

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

## What this spec does *not* cover

- iMessage rich preview / Universal Link `apple-app-site-association` plumbing — separate spec when implementation begins.
- Server-side OG image rendering (for nice link previews). Out of scope here.
- Stripe / Apple IAP gating around any Date Card feature. **Per the monetization thesis: Date Cards stay in the free tier permanently** — they are the viral surface and the most important pricing decision.
- The "I'm home" debrief flow that lives downstream of *Completed* state.
