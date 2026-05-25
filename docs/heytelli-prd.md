# HeyTelli — Product Requirements Document (Consolidated v2)

**Product:** HeyTelli
**Category:** Private AI-Assisted Dating Safety & Clarity Journal
**Platform:** iOS-first native mobile app experience. Implementation target:
Expo / React Native with EAS Build unless a later feature requires custom
Swift/native modules. Android fast-follow. Consumer web app: Phase 2 only
after mobile retention is proven. Internal web/admin console: allowed for
operations and QA, not a user-facing product surface.
**Status:** MVP Blueprint — Phase 1 (Mobile)
**Owner:** Solo Founder

---

## 0. Product Positioning

HeyTelli is a private AI-assisted dating clarity app for women navigating
modern online dating.

Women already screenshot conversations, send profiles to friends, debrief
dates together, compare patterns over time, struggle to remember context
across fragmented threads, and second-guess their own instincts when
emotional momentum builds. **HeyTelli organizes and augments that process.**

It should feel like the smartest, calmest friend in the group chat — the one
who remembers everything.

**The app is:** emotionally intelligent, tactically useful, grounding under
pressure, private-by-default, modern, trustworthy.

**The app is NOT:** a public review board, a "rate men" platform, a
crowdsourced accusation network, a surveillance product, a manipulative
dating optimizer, or an AI danger detector.

---

## 1. Core Thesis

HeyTelli makes users safer and clearer by strengthening **memory,
preparation, emotional reflection, communication awareness, and
trusted-circle collaboration.**

It helps users notice changes in intensity, communication drift, escalating
pressure, inconsistency, recurring emotional themes, and shifts in how
interactions feel over time.

**The product never labels another person.** It does not assign risk scores,
diagnose people, declare anyone dangerous, produce behavioral verdicts, or
create searchable profiles. It surfaces interaction patterns and the user's
own reflections — never objective claims about another human being.

---

## 2. Safety Model — Clarity, Grounding, and Agency

HeyTelli delivers women's safety by **equipping the user**, never by
**judging the match**. It helps her remember what happened, reconnect with
her instincts, slow emotionally escalating situations, compare earlier and
later interactions, prepare before real-world meetings, and involve trusted
friends intentionally.

Tone is protective, emotionally sharp, calm, grounded, observant. It must
never become hysterical, accusatory, fear-driven, punitive, or exploitative.

**Acceptable product language:**
- "Communication became noticeably more intense after date 2."
- "Your recent reflections repeatedly mention feeling emotionally drained."
- "Response cadence changed significantly over the last week."
- "Follow-through became less consistent after exclusivity came up."

**Unacceptable language:**
- "This person is dangerous." / "This person is manipulative."
- "High-risk match." / "Toxicity score." / "Likely narcissist."

---

## 3. The Single-Tenant Principle

**HeyTelli has exactly one account holder per workspace: the user.**

Friends, trusted-circle members, and anyone else never log in, never post,
never hold an account, and never interact with the app directly. They
interact with *the user* — in the user's own group chat, over text, in
person. HeyTelli is the user's private memory layer, not a meeting place.

This is a permanent architectural constraint, not a Phase 1 simplification.
It closes three failure modes at once:

1. **User-generated-content moderation** (App Review Guideline 1.2) — there
   is no UGC, because no second person can post.
2. **Hosted profiles of non-consenting people** — there is no shared,
   hosted, or commentable page about anyone.
3. **An unoperatable social graph** — a solo founder cannot safely run a
   multi-user social product. HeyTelli never becomes one.

**Forcing rule:** any feature that would require a second person to have an
account is out of scope — not deferred, *out*.

---

## 4. Scope & Phasing

The product is sequenced. Each phase has a validation gate: do not begin a
phase until the prior one has proven demand.

### Phase 1 — Mobile MVP (this document's primary scope)
Validation question: *do women want this at all?* Answered on mobile alone.
- Screenshot import + AI extraction
- "Share to HeyTelli" screenshot intake from the iOS share sheet, if the
  Expo/EAS implementation passes the Phase 1 technical spike. This is the
  primary friction reducer for screenshot ingestion.
- Connection timeline (events + reflections)
- Grounding Pulses
- Date Brief + local check-in reminders
- Voice debriefs
- Vibe Check image cards (native share sheet)
- AI Reflection Assistant
- Tiers: **Free + Plus**
- Internal/admin web console for founder operations, QA, support, and API
  inspection only. This is not the consumer web app and not a trusted-circle
  surface.

### Phase 2 — Web App (see §17)
Validation question: *will users stay for years?* Begins only after Phase 1
retention is proven.
- Timeline replay, semantic reflection search, pattern visualization
- Circle Notes (single-tenant — see §17)
- Adds the **Premium** tier
- Requires a deliberate shift to durable cloud storage (§11)

### Phase 3 — Relationship Mode & Specialist-Review Features (see §18)
- Relationship continuity / shared milestone memory (still single-tenant)
- Automated overdue alerts (requires SMS infrastructure + specialist review)
- Temporary Check-In Links (strictly scoped date-status pages; see §8.5.1)
- Duress / decoy-PIN mode (requires digital-safety-for-survivors expertise)

---

## 5. Primary User

Women 25–45 who actively use dating apps, juggle multiple conversations,
experience dating fatigue, already send screenshots to friends, want help
remembering details and spotting patterns, and value emotional clarity and
safety without losing nuance.

Secondary: neurodivergent daters, people re-entering dating after divorce,
high-volume app users.

---

## 6. Core User Loop (Mobile — Phase 1)

```
[ Capture ]   Bulk-import screenshots + optional voice reflections
     ↓
[ Process ]   AI extracts transcript + neutral events + memory context
     ↓
[ Organize ]  Timeline assembles chronologically; reflections + grounding pulses
     ↓
[ Plan ]      Date Brief prepares the user before a real-world meeting
     ↓
[ Share ]     Optional Vibe Check image card exported via native share sheet
```

The conversation about a connection happens in the user's existing group
chat. HeyTelli does not host it — it feeds it and remembers it.

---

## 7. Information Architecture (Mobile)

```
/                          Home Workspace
/add                       Bulk import (image picker + voice recorder)
/connection/[id]           Connection dashboard
   ├── /timeline           Events + reflections
   ├── /date-brief         Pre-date planning
   └── /photos             Screenshot gallery (local copies + extracted text)
/chat/[id]                 AI Reflection Assistant
/profile                   Security, export, deletion controls
```

---

## 8. Core Features (Mobile — Phase 1)

### 8.1 Home Workspace
A calm operational snapshot of active connections: connection list, recent
activity, stale-conversation nudges, vibe tags, recent reflection highlights,
gentle pattern indicators. Tone: warm, minimal, uncluttered. Avoid dashboard
energy, aggressive warning colors, "operator mode" aesthetics.

### 8.2 Bulk Screenshot Import
Multi-select upload via `expo-image-picker`, plus a Phase 1 technical spike
for **Share to HeyTelli** from the iOS Photos/share sheet. The best user flow
is: user screenshots a dating app or chat, taps iOS Share, chooses HeyTelli,
then lands directly in an import confirmation screen with the selected images
already queued.

Pipeline: import → OCR + transcript reconstruction → AI extracts transcript,
names/nicknames, interests, useful locations, timeline events → timeline
updates. Raw screenshots are temporary; backend storage is minimized;
extracted text is preferred over image retention; the raw image is deleted
after extraction where possible. Optional face/name masking before sharing.

Implementation note: Expo/EAS is acceptable only if inbound sharing is reliable
enough in a custom dev build. If the share-sheet spike proves unstable or too
limited, implement this one surface with a native iOS share extension or move
the mobile app closer to a bare/native setup. Screenshot intake friction is a
product-critical requirement, not polish.

### 8.3 Connection Timeline
The emotional center of the app. Combines **events** (neutral facts) and
**reflections** (first-person user notes), plus interaction-rhythm changes,
voice reflections, and AI grounding observations. The system may describe
intensity shifts, consistency drift, communication changes, and recurring
emotional themes — but may never diagnose, label, rank, score, or declare
danger.

### 8.4 Grounding Pulses
Calm intervention cards. **Triggers are anchored in the user's own
reflections and in neutral, fact-based events** — never in a behavior the
system "detects" in the match:
- repeated reflections mentioning uncertainty, anxiety, or feeling drained
- a measurable change in message cadence (a neutral fact derived from
  timestamps)
- the user's own reflections noting that early vs. recent interactions feel
  different

> **Grounding Pulse — A Pattern Worth Noticing**
> Your last three reflections about this connection each mention feeling
> emotionally drained afterward.
> *Sometimes clarity comes from slowing the timeline down, not speeding up.*
> - 🔒 Pause this connection
> - 💬 Boundary language options
> - 🔗 Create a Vibe Check card
> - 📝 Add another reflection

### 8.5 Date Brief
Lightweight pre-date prep. The user fills in venue, time, an optional
check-in window, and an optional trusted friend. The app generates prep
reminders, calming prompts, a logistics summary, and a pre-composed check-in
message she can send to a friend via the native share sheet. A local
`expo-notifications` reminder fires at the end of the check-in window; a
one-tap "Running late, +60 min" prevents false alarms.

> HeyTelli helps users make and remember a safety plan. It is **not** an
> emergency service, a live safety-monitoring platform, or a guarantee of
> physical safety. (True automated overdue alerts: Phase 3 — see §18.)

### 8.5.1 Temporary Check-In Link (Phase 3 Candidate)
The product may later support a temporary **Check-In Link** for trusted
friends to view the user's date status without needing an account. This is
not a "web circle," not a hosted profile, and not a place to discuss or assess
the other person. The page tracks the user's safety plan, not the date.

If built, the link must follow these constraints:
- Shows the user's first name only, or "Your friend" by default.
- Shows date status only: planned, checked in, extended +60, home safe,
  expired, or revoked.
- Venue is vague by default ("Downtown drinks"), with exact location optional
  and user-controlled.
- No photos, screenshots, transcripts, AI summaries, ratings, comments,
  reactions, friend accounts, or friend posting.
- Includes "Text her" and "Call her" actions that open the friend's native
  phone/messaging app.
- Expires automatically within 12-24 hours and can be revoked manually.
- If the user misses a check-in, the page may say "No check-in yet" but must
  not imply danger, blame, or emergency certainty.

This feature is intentionally excluded from the Phase 1 MVP. It requires
careful privacy, abuse, forwarding, revocation, and false-positive design.

### 8.6 Vibe Check Sharing
The user exports a rendered **image card** (selected screenshots, timeline
highlights, summaries, reflections, date plans) via the native iOS/Android
share sheet — `react-native-view-shot` → PNG → `expo-sharing`. No hosted
connection pages, no public pages, no searchable database. Optional face blur,
name masking, watermarking. Sharing is one-way; friends respond in the user's
group chat, as they already do. A future Check-In Link is allowed only under
§8.5.1 and may contain date-status information only.

### 8.7 Voice Debriefs
Post-date reflections recorded locally (`expo-av`), transcribed via Whisper,
and convertible into first-person reflections. Purpose: preserve emotional
nuance, reduce memory drift, help the user reconnect with instinct.

### 8.8 AI Reflection Assistant
A scoped assistant for one connection. Helps the user summarize long threads,
compare earlier vs. later interaction energy, prep date questions, phrase
boundaries, and identify recurring themes *in her own reflections*. It offers
contextual observations, summaries, and reflection prompts — never verdicts,
diagnoses, or certainty claims about another person's intent or character.

---

## 9. AI Guardrails

System-prompt principles:
1. Never apply psychological labels.
2. Never classify anyone as safe/unsafe.
3. Extract events as neutral facts.
4. Help users phrase reflections in the first person.
5. Surface patterns only across the user's own reflections.
6. Avoid manipulative or adversarial dating tactics.
7. Maintain a calm, grounded tone.

**Permitted outputs:** neutral events, summaries, reflection prompts,
contextual observations, grounding pulses.
**Forbidden outputs:** risk scores, toxicity scores, psychological diagnoses,
"dangerous person" claims.

---

## 10. Data Model

```
connections      id, userId, displayName, sourceApp, status, avatarPath,
                 createdAt, updatedAt

screenshots      id, connectionId, objectPath, extractionStatus,
                 extractedText, structuredData, rawImagePurgedAt, createdAt
                 — raw images deleted after extraction wherever possible

events           id, connectionId, eventType, occurredAt, metadata
                 — neutral facts: message_imported, date_logged,
                   voice_debrief, check_in_completed, days_since_contact

reflections      id, connectionId, lens, feltSentiment, reflectionText,
                 circleAttribution (optional), observedAt
                 — always first-person, always authored & owned by the user
                 — lenses: how_i_felt, my_energy_after, communication_rhythm,
                   what_i_want_to_remember, open_questions
                 — circleAttribution: optional free-text name of the friend
                   whose input she is recording (see Circle Notes, §17). The
                   friend has no account and no access.

dateBriefs       id, connectionId, locationText, dateTime,
                 checkInWindowMinutes (integer), status, createdAt
```

There is no `observations` table and no `trustedCircleShares` table — both
would store assessments of, or hosted content about, a third party.

---

## 11. Privacy & Data Principles

The app processes sensitive interpersonal context. Privacy posture protects
**two parties: the user, and any third party appearing in screenshots.**

Core principles: data minimization, raw-image minimization, deletion controls
(cascading purge of all records and storage objects), encryption at rest and
in transit, biometric app lock.

**Storage by phase:** Phase 1 (mobile) is local-first where possible — the
backend holds extracted text, not raw faces. The internal/admin console may
inspect operational records needed for QA/support, but must not become a
consumer-facing archive. Phase 2 (consumer web app) deliberately requires
durable cloud storage to enable timeline replay and search; this is a
conscious architecture decision tied to the Phase 2 gate, not a drift.

HeyTelli must never become a searchable archive of people, a humiliation
engine, or a crowdsourced accusation platform.

---

## 12. App Store Strategy

HeyTelli stays App Store-safe by structural design, not just tone:
- No ratings, verdicts, or behavioral profiling — enforced by the data model.
- No user-generated content — enforced by the Single-Tenant Principle (§3).
- Sharing is private and native-first (image cards, no hosted connection
  dossiers). A future Check-In Link may show temporary user status only.
- AI is framed and constrained as reflection support.
- Stored data is the user's own reflections, not third-party assessments.

The app still feels emotionally sharp — it actively helps users notice
patterns, slow escalating situations, and reconnect with intuition. It is not
passive journaling software.

---

## 13. Monetization

Core safety and planning features stay free — paywalling a check-in reminder
would be bad ethics and bad PR. The paywall wraps depth and clarity.

**Phase 1 (mobile MVP) — two tiers, each viable on mobile alone:**

| Tier | Price | Includes |
|---|---|---|
| **Free** | $0 | Limited connections, basic timeline, manual notes, Date Brief + check-in reminder |
| **Plus** | $9.99/mo | Unlimited connections, voice debriefs, AI Reflection Assistant, weekly debrief, premium Vibe Check cards, full mobile timeline history |

**Phase 2 — adds the Premium tier ($14.99–$19.99/mo):** semantic reflection
search, timeline replay, pattern visualization, Circle Notes. Premium does
not launch until the web app does — its value lives there.

---

## 14. Success Metrics

**Engagement:** screenshot imports, timeline interactions, vibe check shares,
voice debrief usage, weekly active users.

**Clarity (the metrics that matter):** "Did this help you feel clearer?"
pulse, self-reported reduced uncertainty over time, self-reported confidence,
repeat reflection usage.

Optimize for clarity, groundedness, and emotional confidence — not endless
engagement, paranoia, or relationship churn.

---

## 15. Tech Stack

- **Mobile:** Expo / React Native, Expo Router, TanStack Query, Nativewind,
  EAS Build, custom dev builds for native capabilities.
- **Inbound Screenshot Sharing:** `expo-sharing` inbound share support or a
  native iOS share extension. Must support selecting one or more screenshots
  from Photos/share sheet and routing them into the import confirmation flow.
  Validate early because this is a critical friction reducer.
- **Sharing:** react-native-view-shot, expo-sharing
- **Backend:** Fastify on Railway, SSE streaming. During scaffold conversion,
  an existing Express service may be used temporarily, but Fastify/Railway is
  the target backend shape.
- **Database:** Postgres + Drizzle ORM
- **Storage:** Cloudflare R2 (raw images transient — purged post-extraction)
- **AI:** OpenRouter abstraction (GPT / Claude compatible), Whisper
  transcription, vision extraction
- **Auth:** Sign in with Apple, Google, email magic links
- **Payments:** RevenueCat — **Analytics:** PostHog, Sentry
- **Internal Web/Admin Console:** lightweight authenticated operator console
  for QA, support, API inspection, data deletion verification, and extraction
  debugging. It is not the consumer web app, not a friend-facing surface, and
  not part of trusted-circle collaboration.

---

## 16. Design Direction

Calm, modern, premium, emotionally intelligent, warm minimalism. References:
Notion, Headspace, Calm, Apple Journal, Locket. Avoid hot-pink dating-app
energy, surveillance vibes, dashboard/operator aesthetics, gossip aesthetics.

---

## 17. Phase 2 — The Web App (NOT in MVP scope)

> Build only after Phase 1 retention is proven. The web app is where
> HeyTelli's longitudinal-memory moat matures. It is **single-tenant** (§3):
> only the user has an account. There is no friend-facing connection surface.
> This is separate from the internal/admin console in §15.

### 17.1 Timeline Replay
Replay a connection's progression chronologically; compare early vs. later
interactions; view cadence changes; revisit reflections in sequence. Purpose:
help the user reconnect with reality over emotional momentum.

### 17.2 Semantic Reflection Search
Search the user's own reflections: "every time I mentioned feeling anxious,"
"when did communication start feeling different." A core Premium feature.

### 17.3 Pattern Visualization
Elegant, non-clinical visualization of communication frequency, emotional
trend shifts, reflection themes, and periods of consistency vs. uncertainty.
No risk dashboards, no surveillance or law-enforcement aesthetics.

### 17.4 Circle Notes (replaces the former "Trusted Circle Workspace")
The old multi-user workspace — threaded comments, voice reactions — is
**removed**. It violated the Single-Tenant Principle and recreated a
commentable hosted page about a named person.

Trusted-circle collaboration is preserved differently: the user shares a Vibe
Check card out (mobile, native share sheet), the discussion happens in her
real group chat, and the web app lets her log a **Circle Note** — a
first-person record, in her own words, of what a trusted friend told her
("Holly flagged that he's cancelled twice — she said watch that").

A Circle Note is stored as a `reflection` with `circleAttribution` set. It is
her data, authored by her. No friend ever has an account, posts content, or
accesses the app. HeyTelli is not the group chat — it is the memory layer the
group chat never had: what she brings to it, and what she carries back.

---

## 18. Phase 3 & Future Roadmap

- **Relationship Mode** — shared memory timelines, recurring-conflict
  reflection, milestone memory, continuity tools. Reduces the
  "find a relationship = churn" problem. Still single-tenant.
- **Temporary Check-In Links** — date-status pages for trusted friends that
  show only the user's check-in state and expire quickly. No photos,
  screenshots, transcripts, ratings, comments, or hosted connection dossiers.
- Share-extension hardening, screenshot stitching, on-device OCR, on-device
  redaction, smart duplicate detection.
- **Specialist-review features** (do not ship casually):
  - Automated overdue alerts — requires opt-in SMS (Twilio) and careful
    false-positive design.
  - Duress / decoy-PIN mode — requires consulting a
    digital-safety-for-survivors organization; changes the threat model to
    intimate-partner violence, where a half-right build causes physical harm.
- Counselor/advisor review mode, attachment-pattern journaling, emotional
  trend analytics.

---

## 19. Long-Term Moat

HeyTelli's moat is not OCR or screenshot ingestion. It is **longitudinal
emotional memory + AI-assisted clarity + trusted-circle collaboration.**

The strongest version of the product helps users remember clearly, notice
patterns earlier, feel grounded under emotional pressure, and make better
decisions — without ever turning another person into an algorithmic verdict.
