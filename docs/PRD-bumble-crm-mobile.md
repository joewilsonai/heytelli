#Here is your fully updated, comprehensive Product Requirements Document (PRD). It has been completely rewritten to weave the **women’s safety-first online dating clarity** thesis directly into every feature, database table, visual cue, and AI prompt while keeping development lean and achievable for a solo founder on Expo.
# Product Requirements Document: HeyTelli
**Product:** HeyTelli
**Category:** Private AI-Assisted Dating Safety & Clarity Journal
**Platform:** Expo / React Native (iOS, Android) + Tailwind CSS (Nativewind)
**Status:** MVP Blueprint (Phase 1 Validation)
**Owner:** Solo Founder
## 1. Product Overview & Thesis
### 1.1 Overview
HeyTelli is a private, local-first AI-assisted safety and clarity journal designed for women navigating modern online dating. The app bridges the dangerous structural gap between digital matching on dating platforms and physical real-world meetings.
HeyTelli does **not** connect directly to dating platforms. It acts as an independent, private workspace where users drop screenshots, voice debriefs, and manual notes. The app then parses this data to build chronological connection timelines, flag early behavioral warning signs, and facilitate seamless, private check-ins with a trusted circle of friends.
### 1.2 Brand Tone & Identity
 * **The Vibe:** Notion + Headspace + Group Chat Energy.
 * **Visual Direction:** Warm minimalism. Soft neutral bases (slate, cream tints), grounding empty spaces, and clear scannability. Avoid hyper-gamified components, toxic gossip aesthetics, or loud, panic-inducing security red alerts.
 * **Core Emotional Framework:** Calm, emotionally intelligent, trustworthy, protective, and grounding.
### 1.3 The Core Safety Thesis
Most physical dating incidents and toxic emotional situations are preceded by subtle digital behaviors—such as boundary testing, rushing intimacy, isolation comments, or unpredictable communication cadences. Because modern dating apps optimize for engagement, these warning patterns get lost in fragmented text threads. HeyTelli organizes this data to surface clear, unarguable behavioral facts **before** a user steps into a vulnerable real-world setting.
> **The Shield Rule:** HeyTelli acts strictly as a private workspace. It is **NOT** a public rating board, a searchable database of individuals, a crowdsourced accusation network, or a surveillance app.
> 
## 2. Core User Loop
```
[ Upload Data ] ──────► Bulk upload chat & profile screenshots + record voice debriefs
       │
[ Private Processing ] ──► Async AI pipeline extracts transcripts and logs behavioral signals
       │
[ Update Timeline ] ───► Interactive ledger categorizes facts and surfaces "Safety Pulses"
       │
[ Share Vibe Check ] ──► Generate secure, tokenized web links for group chat emergency contacts
       │
[ Real-World Date ] ───► Fill out a 60-second local Date Brief with automated check-in triggers

```
## 3. Information Architecture & App Map
```
/                           Home Workspace (Connections list, active status trackers)
/add                        Bulk import interface (Image picker & Voice Debrief recorder)
/connection/[id]            Comprehensive Connection Dashboard
   ├── /timeline            Chronological ledger (Screenshots, entries, AI Safety Pulses)
   └── /date-brief          Pre-date planning checklist & tracking hub
/chat/[id]                  Isolated AI Reflection Assistant for a specific connection
/profile                    User security controls, biometric locks, and data wipe toggles

```
## 4. Technical Architecture & Database Schema
To maximize developer velocity for a solo founder on Expo, data processing is divided between an asynchronous cloud AI pipeline and secure local-first device storage.
```typescript
// Drizzle Schema Definition (PostgreSQL / Supabase Compatible)

import { pgTable, uuid, text, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core';

export const connections = pgTable('connections', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  displayName: text('display_name').notNull(),
  sourceApp: text('source_app'), // e.g., 'Hinge', 'Tinder', 'iMessage'
  status: text('status').default('active').notNull(), // active, paused, archived
  avatarPath: text('avatar_path'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const screenshots = pgTable('screenshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  connectionId: uuid('connection_id').references(() => connections.id, { onDelete: 'cascade' }),
  objectPath: text('object_path').notNull(), // Cloudflare R2 path
  extractionStatus: text('extraction_status').default('pending').notNull(), // pending, processing, completed, failed
  extractedText: text('extracted_text'), // Raw OCR text fallback
  structuredData: jsonb('structured_data'), // AI-extracted profile context/messages
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const observations = pgTable('observations', {
  id: uuid('id').defaultRandom().primaryKey(),
  connectionId: uuid('connection_id').references(() => connections.id, { onDelete: 'cascade' }),
  category: text('category').notNull(), // boundary_testing, pacing, sexual_acceleration, consistency
  polarity: text('polarity').notNull(), // positive, neutral, warning
  observationText: text('observation_text').notNull(), // Fact-based phrasing only
  observedAt: timestamp('observed_at').defaultNow().notNull(),
});

export const dateBriefs = pgTable('date_briefs', {
  id: uuid('id').defaultRandom().primaryKey(),
  connectionId: uuid('connection_id').references(() => connections.id, { onDelete: 'cascade' }),
  locationText: text('location_text').notNull(),
  dateTime: timestamp('date_time').notNull(),
  checkInWindowMinutes: text('check_in_window_minutes').default('180').notNull(),
  isCompleted: boolean('is_completed').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const trustedCircleShares = pgTable('trusted_circle_shares', {
  id: uuid('id').defaultRandom().primaryKey(),
  connectionId: uuid('connection_id').references(() => connections.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').notNull(),
  shareToken: text('share_token').unique().notNull(), // Cryptographic token for web views
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

```
## 5. Detailed Feature Specifications
### 5.1 Workspace Home Screen (/)
The main viewport displays an ongoing snapshot of active romantic connections, prioritized by ongoing activity and safety tracking.
 * **Connection Ledger:** Rows displaying avatar, display name, origin app, and context pills.
 * **Fact-Over-Opinion Tags:** Rows display objective data anchors derived from past interactions instead of subjective labels (e.g., "Met in Public", "Follows-Through", "Cadence Shift").
 * **Stale Nudges:** Flags connections that have remained entirely unverified or inactive for greater than 14 days to encourage database pruning.
### 5.2 Async Bulk Screenshot Import (/add)
Allows users to multi-select up to 5 screenshots at once using the native mobile image picker (expo-image-picker) to prevent the friction of single uploads.
**Direct-to-Object Storage Upload**
*Client-side Execution*
The Expo client requests a pre-signed upload URL from the Fastify backend and securely streams the raw image payload directly into an isolated Cloudflare R2 bucket.**Database Initialization**
*Instant UI Feedback*
The application saves references into the screenshots table with an initial status of pending. The UI renders a clean processing animation over the specific connection&#39;s timeline ledger.**Background Vision Processing**
*Edge Server Execution*
A Fastify background task compiles the image batch and fires a context-optimized payload to the OpenAI Vision API / OpenRouter abstraction wrapper.**State Ingestion &amp; Client Sync**
*SSE Stream Sync*
The processed JSON transcript updates the database, changes status to completed, and triggers a Server-Sent Event (SSE) to update the client application layout in real-time.
### 5.3 The Safety-First Timeline & "Safety Pulses" (/connection/[id]/timeline)
The timeline builds an interactive, unalterable log of verified behaviors. Rather than evaluating individual character traits or computing arbitrary "safety scores," the underlying engine monitors deviations from normal conversational pacing.
 * **Objective Event Architecture:** Logs dates, screen grabs, text summaries, and voice notes chronologically.
 * **Automated Safety Pulses:** If the background parser identifies high-risk behavioral signals (e.g., pushing to leave the app immediately, ignoring explicit conversational diversions, or escalating sexual pressure after a boundary was set), the timeline does not throw an alarmist red alert. Instead, it serves an inline, calming **Safety Pulse card**.
> ### 💡 Grounding Pulse: Conversational Shift
> The system noted that the match returned to explicit sexual topics three times after you explicitly modified the subject.
> **A quick mental anchor:**
> You are entirely in control of this timeline's pace. You are never obligated to provide a response, a justification, or a compromise on your comfort level.
>  * [🔒 Pause this Conversation]
>  * [💬 Open Boundary Text Options]
>  * [🔗 Share Secure Vibe Check Link]
> 
### 5.4 The 60-Second Date Brief (/connection/[id]/date-brief)
A functional safety tool completed prior to a real-world encounter. It avoids complex background GPS infrastructure in favor of zero-friction, reliable communication channels.
 * **The Checkpoints:** The user manually writes down the venue location, anticipated start time, and a safety check-in window (e.g., 3 hours).
 * **Native Alerts:** Leverages expo-notifications locally to prompt a silent status check-in when the timer concludes.
 * **The Guardrail Option:** If the safety timer expires without user confirmation or extension, a push message is sent out to designated emergency numbers via the web sharing mechanism.
### 5.5 Tokenized Web-View Vibe Checks (/circle)
Building an intricate internal social ecosystem within an MVP adds immense codebase friction and creates acquisition drops. HeyTelli bypasses this entirely using secure link deployment.
 * **The Workflow:** When a user wants feedback or wants a contact to watch over them on a date, they click "Share Vibe Check." The backend spins up a unique cryptographically signed, unindexed link: [hey-telli.com/shared/](https://hey-telli.com/shared/)[secure_token].
 * **The Group Chat Surface:** Friends open this secure URL inside iOS Safari or Android Chrome straight from their group text threads. They see a clean web view summarizing connection highlights, timeline notes, and active Date Brief statuses.
 * **Frictionless Feedback Controls:** To guarantee zero moderation issues during Apple App Review, friends **cannot** input free-form text comments. Instead, they interact via one-tap utility reactions:
| Functional Option | Direct Outcome for the User Inside the Mobile App |
|---|---|
| **🚨 Call Me** | Triggers an immediate push alert advising the user to make a clean break or exit. |
| **⚠️ Look Closer** | Flags the connection's profile in the user's home screen with a tracking note. |
| **👍 Green Light** | Appends a positive validation node directly into the timeline database. |
### 5.6 Secure Voice Debriefs (/add)
Captures emotional context directly following a real-world date or telephone call, bypassing cognitive filtering or memory distortion.
 * **Execution:** Records clear audio locally using expo-av, streams the .m4a file straight to OpenAI Whisper for rapid transcription, and pipelines the output text into the safety monitoring layer to catch lingering context flags.
## 6. AI Ingestion & Prompt Optimization
### 6.1 System Ingestion Guardrails (The OpenRouter Protocol)
To remain legally protected and pass App Store content review, the AI layer must act strictly as a fact extractor. It is barred from applying clinical diagnoses or using toxic hyper-reactive web buzzwords.
```markdown
You are a highly analytical, objective safety verification assistant built for HeyTelli. 
Your core responsibility is to scan incoming dating transcripts, extracted profile screenshots, and vocal journals to organize timelines and flag baseline conversational shifts.

CRITICAL INSTRUCTIONS:
1. Never apply psychological labels or personality disorder characterizations (e.g., "Narcissist", "Sociopath", "Gaslighter").
2. Focus exclusively on extracting verifiable actions. (e.g., write "Match requested home location details twice after user shifted focus to a public coffee house" instead of "Match is acting controlling").
3. Do not overreact to consensual, mutually enthusiastic adult banter. Focus alerts purely on boundary testing, rapid escalation, isolation comments, and conversational pressure.

OUTPUT STRUCTURING:
Return clear JSON strings indicating data fields alongside an isolated "safety_signals" node if anomalies are present.

```
## 7. App Store Review Strategy & Security Hardening
To navigate Apple App Store regulations safely, specific technical strategies are engineered directly into the core design.
### 7.1 Security & Duress Protocols (Guideline 2.3.1)
 * **Biometric Shielding:** Access is locked via expo-local-authentication on every initial launch and background-to-foreground toggle.
 * **The Safe-PIN Exit:** Users configure a secondary safety unlock passcode. If typed in under duress (such as an aggressive individual visually interrogating the user's screen), the app hides the entire dating data structure and swaps the active layout with a generic, unblemished digital journal container (/profile). *This system is completely documented inside the App Review Submission notes to satisfy hidden feature rules.*
### 7.2 Data Management (Guideline 5.1.1)
 * **Account Obliteration:** A prominent button sits inside /profile that calls a cascading database purge, completely erasing the user's records, active session keys, and associated R2 image buckets instantly.
## 8. Success Analytics (PostHog Metrics)
 * **Primary Value Metric:** Ratio of screenshot additions to structural timeline interactions.
 * **Retention Signal:** Frequency of Voice Debrief execution following a scheduled Date Brief closure.
 * **Virality Trigger:** Conversion rate of secure web share generations to external browser link openings.
### Suggested Next Step
Now that the complete safety-first PRD is locked down, would you like to build out the exact **Tailwind/Nativewind CSS layout and layout architecture for the home screen (/)**, ensuring it looks like a premium, calming reflection workspace?
 Bumble CRM Mobile — Product Requirements Document

**Product:** Bumble CRM Mobile (Expo / React Native, ships to iOS, Android, and Web)
**Codename:** `bumble-mobile`
**Status:** Phase 3 shipped (May 25, 2026)
**Owner:** Solo operator workflow — "treat dating like a sales pipeline"

---

## 1. Problem

Dating apps are optimized for the platform, not the user. A power user juggling 10–30 simultaneous matches loses track of who said what, when to follow up, which conversations are stalling, and which dates are worth a second swing. The app's native UI gives you a chat thread and nothing else — no memory, no analytics, no coaching, no pipeline view.

## 2. Goal

A private, single-user CRM for Bumble that turns screenshots of matches into a structured pipeline with AI-assisted coaching at every stage: **scoring → conversation → date → debrief → re-engage or archive**.

The app never touches Bumble's servers. All input is screenshot- or voice-based. All intelligence runs through a single API server (`api-server`) that calls GPT-5.4 via the Replit OpenAI proxy.

## 3. Non-Goals

- No automated messaging on Bumble's behalf (TOS).
- No native-only iOS surfaces in this phase (share extension, home-screen widget, push delivery — deferred).
- No multi-user / social features.

---

## 4. Users & Core Loop

**Persona:** One user. High match volume. Wants fewer dead-ends and more second dates.

**Daily loop:**
1. Snap a screenshot of a new match → app extracts profile + scores.
2. Snap chat screenshots as they accumulate → transcript builds.
3. When a date is scheduled → AI prep brief + outfit note + calendar reminder.
4. Day-after → voice debrief; transcript and recap saved.
5. Weekly Sunday → "Sunday debrief" tells you what to do this week.

---

## 5. Information Architecture

```
/                       Matches list (home)
/add                    Add match (camera / library)
/match/[id]             Match detail (the big screen)
/match/[id]/photos      Photo gallery for one match
/chat                   "Wingman" — Grok chats about any match
/chat/[id]              Single conversation thread
/analytics              Conversion funnel + totals
/weekly                 Sunday debrief (AI weekly recap)
```

---

## 6. Feature Inventory (all phases)

### 6.1 Matches list — `/`

![Matches home](../screenshots/home.jpg)

- Sortable list: **Recent**, Sex potential, Conversion, Chemistry, Name.
- Status filter chips: **Active / Archived / Ghosted** with live counts.
- **Tag filter chips** (Phase 3): every user-added tag becomes a `#tag` chip. Tap to filter; tap again to clear.
- Per-row preview: avatar, name, one-line bio, last activity ("30m ago"), three score badges (Sex / Conv / Chem) colored by value.
- **Auto-archive banner** (Phase 3): when a match has gone cold (no activity > N days, no scheduled date), a dismissible banner offers one-tap **Archive** or **Mark ghosted**.
- **Stale nudges**: AI-generated re-engagement suggestions surfaced for active matches that have stalled.
- Header actions: **Analytics** (bar chart icon), **Wingman** (chat icon), **Add** (+).

### 6.2 Add match — `/add`

![Add match](../screenshots/add-match.jpg)

- Two entry points: **Take photo** (camera) or **Choose from library**.
- On upload:
  1. Screenshot uploaded to object storage.
  2. Server calls GPT-5.4 vision to extract: name, bio, age, occupation, city, prompts, vibe tags.
  3. Initial scores generated: **Sex potential / Conversion / Chemistry** (0–10).
  4. Match row created and surfaced at the top of the list.

### 6.3 Match detail — `/match/[id]`

![Match detail (full scroll)](../screenshots/match-detail-full.jpg)

This is the core surface. Cards from top to bottom:

#### Header
- Avatar, name, status pill (Active/Archived/Ghosted), bio, vibe tags.
- Edit pencil → rename, change avatar.

#### Wingman shortcut
- "Chat with Grok about [name]" — opens a per-match AI thread that has all context (transcript, scores, dates, notes).

#### Voice surfaces
- **Voice debrief** — long voice note, Whisper transcription, AI updates scores + flags.
- **Voice note check** — critique a draft voice note before sending.
- **Record date (live)** — with-consent live transcription during a date.

#### Date scheduling
- **Schedule a date** card → time + location + **outfit note** (Phase 3).
- Once scheduled, becomes a **Next date** card showing date/time, location, and an outfit pill ("Outfit: black turtleneck + boots").
- Buttons: **AI prep brief** (GPT-5.4 summary of everything we know + ice-breakers), **Add to calendar**, **Reschedule**.
- The prep brief is **persisted on the match** (not ephemeral local state) and carries a freshness pill. It flips to amber-stale with a reason whenever (a) a new screenshot finishes extraction, (b) any date-related context changes — past-date log, upcoming-date time/location/outfit, or notes — or (c) the brief is more than 5 days old. The reason text tells you which one ("3 new screenshots since" / "Date details updated" / "Older than 5 days") so you know whether a regenerate is worth the tokens.
- Post-date: automatic "How did it go?" debrief card with quick recap input.

#### Scores
- Three bars (Sex / Conversion / Chemistry) with values + AI explanation paragraph.
- Refresh button re-runs scoring against latest transcript and notes.

#### Cheat sheet (Phase 3)
- Tap zap → GPT-5.4 returns **3 quick replies**: **Playful / Curious / Direct**, each tagged with style + icon.
- Tap any reply to copy to clipboard with haptic confirmation.
- Refresh to regenerate.

#### Reply suggestions
- One-shot **Generate 3 replies** button — longer-form alternatives tuned to recent message.

#### Red flag radar (Phase 3)
- Tap zap → AI scans transcript + dates + notes and returns:
  - **Red flags** with severity (low/med/high) and the evidence line.
  - **Green flags** with the evidence line.
  - **Overall read** — italic one-paragraph synthesis.
- Re-analyze on demand.

#### Response cadence (Phase 3)
- Status pill: **Balanced / You're chasing / She's chasing / Not enough data** (computed from screenshot upload gaps).
- Stats: her avg reply, your avg reply, longest gap from her, message counts both sides.

#### Conversation log + screenshots
- Collapsible list of all uploaded screenshots with extraction status.
- **View all N photos** button → opens the gallery screen.

#### Transcript
- Collapsible chronological transcript (extracted from screenshots).

#### Tags (Phase 3)
- Inline tag chips (lowercased). **Add tag** input. Long-press to remove.
- Tags drive home-screen filtering.

#### Notes
- Free-form private notes (pencil to edit).

#### Status actions
- **Archive** or **Mark ghosted** — moves out of active list.

### 6.4 Photo gallery — `/match/[id]/photos`

![Photo gallery](../screenshots/photos.jpg)

- 2- or 3-column grid (responsive on width).
- Header shows screenshot count.
- Per-tile badge for `extracting` / `failed` states.
- Tap a thumbnail (planned: lightbox; currently shows the still).

### 6.5 Wingman chat — `/chat`

![Wingman](../screenshots/chat.jpg)

- All AI threads in one place. Mix of per-match and "All matches" pipeline threads.
- Each thread is a full GPT-5.4 chat seeded with the relevant context.
- New chat button to start one against any match or the whole pipeline.
- Sub-route `/chat/[id]` is the conversation thread itself.

### 6.6 Analytics — `/analytics` (Phase 3)

![Analytics](../screenshots/analytics.jpg)

- **Conversion funnel**: Matched → Conversed → Date scheduled → First date → Repeat date. Bars sized to max stage; per-stage % shown relative to top of funnel. (Stage math uses set-union so a match never double-counts.)
- **Totals** card: All / Active / Archived / Ghosted / Date scheduled / Date completed.
- **Weekly debrief** CTA (primary button) → `/weekly`.

### 6.7 Weekly debrief — `/weekly` (Phase 3)

![Weekly debrief](../screenshots/weekly.jpg)

- AI Sunday roll-up. GPT-5.4 ingests every active match's last week and outputs:
  - **Headline** + **summary** paragraph.
  - **Active count** + **new this week** count.
  - **This week's actions** — numbered, prescriptive ("Lock a time with Gretchen by Wednesday").
  - **Per match** rows with status pill (Heating up / Cold / Needs attention / Deprioritize / Steady), a one-line reason, tap-through to the match.
- Refresh icon re-runs the analysis.

---

## 7. AI Surface Map

| Surface | Model | Trigger | Input | Output |
|---|---|---|---|---|
| Profile extraction | GPT-5.4 vision | On screenshot upload | Image | Name, bio, vibe tags |
| Transcript extraction | GPT-5.4 vision | On chat screenshot upload | Image | Messages (her/you, text) |
| Scores | GPT-5.4 | After extraction or on demand | Profile + transcript + notes | 3 scores + explanation |
| AI prep brief | GPT-5.4 | Date day | Full match context | Conversation roadmap |
| Cheat sheet | GPT-5.4 | On demand button | Latest message + context | 3 replies (playful/curious/direct) |
| Reply suggestions | GPT-5.4 | On demand button | Same | 3 longer replies |
| Red flag radar | GPT-5.4 | On demand button | Transcript + dates + notes | Flags w/ severity + evidence |
| Voice debrief | gpt-4o-mini-transcribe + GPT-5.4 | Recording end | Audio | Transcript + score delta |
| Voice note check | Same | Recording end | Audio | Critique |
| Live date recording | Same | Recording end | Audio | Transcript + recap |
| Stale nudges | GPT-5.4 | Background on list view | All active matches | Re-engagement suggestions |
| Auto-archive candidates | Deterministic + reason text | List view | All matches | Cold-match list |
| Weekly debrief | GPT-5.4 | On demand | Last 7d across pipeline | Headline + actions + per-match status |
| Wingman threads | GPT-5.4 (multi-turn) | User chat | Seeded context | Conversational replies |

---

## 8. Data Model (core)

`matches`
- `id`, `name`, `bio`, `avatarObjectPath`, `status` (`active`|`archived`|`ghosted`)
- `vibeTags text[]`, `tags text[]` (Phase 3, user-controlled)
- `scores` (sex / conv / chem), `scoresExplanation`, `scoreHistory[]`
- `nextDateAt timestamptz`, `nextDateLocation text`, `nextDateOutfit text` (Phase 3)
- `dateHistory[]` ({ id, when, location, recap, createdAt })
- `lastDateBrief` jsonb — `{ brief, generatedAt, screenshotCountAt, contextHash }`. `contextHash` is a 16-char sha256 over the stable subset of date-related inputs (date history `when`/`location`/`recap`, next-date time/location/outfit, notes); the read path recomputes it to flip the pre-date brief between current and stale.
- `transcript[]`, `notes`, `createdAt`, `updatedAt`

`matchScreenshots` — { id, matchId, objectPath, extractionStatus }
`matchScoreHistory` — score-over-time series
`openrouterConversations` / `openrouterMessages` — Wingman threads
`voiceRecordings` — debrief / date / voice-note-check artifacts

## 9. API Surface (selected)

```
GET    /api/matches
GET    /api/matches/:id
PATCH  /api/matches/:id            // accepts tags, nextDateOutfit, status, scores, notes, ...
POST   /api/matches                // create from screenshot
GET    /api/matches/stale-nudges
GET    /api/matches/auto-archive-candidates       (Phase 3)
GET    /api/matches/weekly-debrief                (Phase 3)
GET    /api/matches/:id/date-brief
GET    /api/matches/:id/red-flags                 (Phase 3)
GET    /api/matches/:id/cheat-sheet               (Phase 3)
GET    /api/matches/:id/response-stats            (Phase 3)
GET    /api/matches/:id/replies
GET    /api/analytics/funnel                      (Phase 3)
POST   /api/voice/{debrief|date|note-check}       // multipart audio
GET/POST /api/openrouter/...                      // Wingman chat
GET    /api/storage/objects/:path                 // signed object serving
```

All route handlers register sub-paths **before** `/matches/:id` so the dynamic id doesn't swallow them. OpenAPI spec lives at `lib/api-spec/openapi.yaml`; clients (`@workspace/api-client-react` + `@workspace/api-zod`) are generated via orval.

---

## 10. Notifications & Reminders

- Local notification scheduled for **9am on date day** (cancelled if date is rescheduled / cleared).
- Post-date debrief card appears automatically once the scheduled time has passed.
- **Push delivery is not in this phase** — requires a dev build outside Expo Go.

---

## 11. Phases Shipped

**Phase 1** — Foundations: match list, add match, profile/transcript extraction, scores, notes, archive, screenshots.
**Phase 2** — Coaching depth: voice debriefs, voice note check, live date recording, AI prep brief, reply suggestions, calendar/date-day reminders, Wingman chat (per-match + pipeline-wide), stale nudges.
**Phase 3** — Operator mode (this PRD's deliverable):
  - Weekly debrief
  - Red flag radar
  - Cheat sheet
  - Photo gallery screen
  - Tags + home filter
  - Auto-archive prompts
  - Conversion funnel analytics
  - Response-time cadence analyzer
  - Outfit note on scheduled dates

**Explicitly deferred** — iOS share extension, home-screen widget, push notifications. All require a custom dev client.

---

## 12. Open Questions / Next

1. **Photo lightbox** — current gallery shows the still; add full-screen swipe view.
2. **Cross-screen cache invalidation** — PATCH currently refetches the match detail locally; analytics / weekly / home would benefit from explicit `queryClient.invalidateQueries` on the relevant keys.
3. **Cheat-sheet / red-flag caching** — currently re-runs each tap. The pre-date brief now persists with a context-hash freshness check; extend the same pattern to cheat sheet and red flag radar to save tokens.
4. **Tag suggestions** — auto-suggest tags from vibe analysis.
5. **Funnel by cohort** — split funnel by week or by tag to see what's working.
6. **Native dev build** — unblocks push, widgets, share extension for Phase 4.

---

## 13. Tech Stack

- **Mobile:** Expo SDK (Router 6, Image, AV→Audio, Notifications, Haptics, Camera, Clipboard).
- **State/data:** TanStack Query via generated `@workspace/api-client-react`.
- **Backend:** Fastify (`@workspace/api-server`), Drizzle ORM on Postgres.
- **AI:** GPT-5.4 chat + vision, `gpt-4o-mini-transcribe` for audio, all through `@workspace/integrations-openai-ai-server` (Replit AI Integrations proxy — no per-user keys).
- **Object storage:** Replit App Storage via `/api/storage/objects/:path` signed serving.
- **Monorepo:** pnpm workspaces; OpenAPI-first contract via orval codegen.
