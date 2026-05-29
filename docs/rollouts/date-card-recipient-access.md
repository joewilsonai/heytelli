# Date Card Recipient Access Rollout

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

1. Fix swarm recovery so blocked issues become executable `risk:extra_agent_review` work instead of dead-ended `risk:no_auto_merge` work.
2. Add Railway Postgres migrations and backend route tests.
3. Add mobile Date Plan editor integration: create card, pick up to 3 circle people, share links.
4. Add recipient web route with the polished Date Card page.
5. Add sender-side status updates and timeline events.
6. Run focused verification for privacy, expiry, revocation, idempotency, and stale-token behavior.
7. Build and submit TestFlight after backend and mobile routes are wired.

## Swarm operating rule

If a privacy/safety review blocks a Date Card issue, the recovery lane must create a new executable issue with:

- `agent-ready`
- `swarm-recovery`
- `risk:extra_agent_review`
- relevant `privacy`, `safety`, `security`, and `architecture` labels

Recovery PRs stay review-gated, but they must keep moving. A blocked swarm issue is not allowed to become a silent parking lot.
