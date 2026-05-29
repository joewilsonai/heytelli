# Date Card Recipient Access Rollout

## Status

Implementation is now wired for the V1 Railway-backed flow:

- Railway Postgres migration `0005_date_cards.sql` creates `date_cards`, `date_card_recipients`, and `date_card_events`.
- The API exposes authenticated sender routes at `/api/date-cards/*`.
- The recipient page is available at `/c/:shareToken` without requiring an account.
- Recipient actions post to `/api/date-card-shares/:shareToken/*`.
- The iOS Date Plan flow creates private links before opening the native share sheet.
- The sender view can reload Date Card status and show viewed/confirmed progress.

## Product decision

HeyTelli will ship Date Card recipient access as a private, expiring Railway-backed web link for selected circle people.

This is allowed because the link is a safety-plan status page, not a hosted profile or discussion space about the match.

## What the circle person sees

- HeyTelli mark and a calm header like "Terry shared a Date Card with you."
- Sender first name or chosen display name.
- Match first name only.
- Date time, expected end time, check-in time, venue label or area, transport/exit plan, optional code word hint, and sender-written note.
- Current status: planned, viewed, confirmed, on date, awaiting check-in, home safe, expired, or revoked.
- Primary action: "Got it."
- Native actions: text her, call her if the sender chose to include those contact actions.
- Soft footer that explains HeyTelli without turning the card into an ad.

The recipient does not see screenshots, chat transcripts, profile photos, AI analysis, tags, ratings, red flags, green flags, other matches, or match history.

## Where it lives

- Runtime: existing Railway API service for V1.
- Recipient route: `/c/:shareToken`.
- API routes: `/api/date-cards/*` and `/api/date-card-shares/*`.
- Storage: Railway Postgres structured tables only.
- Token storage: hash share tokens server-side; never store raw tokens.
- Media storage: no Date Card screenshots, profile photos, or transcripts in backend storage.

## Data rules

- Do not store `match_id` on server-side Date Card or share records.
- Store first names/labels only.
- Store recipient relationship labels like "sister" or "roommate" if the sender provided them.
- Do not store recipient phone/email for receiving the card. Store contact info only if the recipient explicitly opts into reminders.
- Expire cards at `date_end + 24h`.
- Sender can revoke at any time.
- Recipient events must be idempotent: viewed, confirmed, muted.

## Rollout sequence

1. Done: fix swarm recovery so blocked issues become executable `risk:extra_agent_review` work instead of dead-ended `risk:no_auto_merge` work.
2. Done: add Railway Postgres migrations and backend route tests.
3. Done: add mobile Date Plan editor integration to create card links for up to 3 circle people and share them through the native sheet.
4. Done: add recipient web route with the polished Date Card page and Got it action.
5. Done for V1: sender-side status reload shows viewed/confirmed progress from Railway.
6. Done in code: focused verification covers no screenshots, no transcripts, no server-side `match_id`, no raw tokens, no recipient PII by default, expiry/revocation structure, and idempotent events.
7. Next: apply the Railway migration, deploy the API, build iOS, and submit TestFlight.

## Swarm operating rule

If a privacy/safety review blocks a Date Card issue, the recovery lane must create a new executable issue with:

- `agent-ready`
- `swarm-recovery`
- `risk:extra_agent_review`
- relevant `privacy`, `safety`, `security`, and `architecture` labels

Recovery PRs stay review-gated, but they must keep moving. A blocked swarm issue is not allowed to become a silent parking lot.
