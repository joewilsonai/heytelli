# Haystack

A vision-first dating CRM for women. Drop in a screenshot of a Bumble match and Haystack extracts the profile, transcribes the chat, scores chemistry, drafts replies, briefs you before the date, and debriefs you after. Built as a pnpm monorepo with a React Native (Expo) app, a companion web app, and a shared Express API.

> **Status:** active development. Names you'll see in the code: the product is *Haystack*; the mobile artifact directory is still `bumble-mobile` for historical reasons.

---

## What's in the box

The repo is a monorepo with four artifacts and a stack of shared libraries.

### Artifacts

| Artifact | Kind | Path | What it is |
|---|---|---|---|
| **Haystack** | mobile (Expo) | `artifacts/bumble-mobile` | The main app — match list, screenshot upload, AI wingman chat, pre-date brief, post-date voice debrief, analytics. |
| **Bumble Reply Generator** | web (Vite + React) | `artifacts/bumble-reply` | A lighter web companion / admin surface for managing matches and uploading screenshots from a desktop. |
| **API Server** | api (Express) | `artifacts/api-server` | The backend that owns the DB, object storage, and all AI integrations. |
| **Canvas** | design sandbox | `artifacts/mockup-sandbox` | Vite preview server for prototyping isolated UI components on the Replit canvas. Not user-facing. |

### Shared libraries (`lib/`)

- **`db/`** — Drizzle schema, migrations, and DB client. Single source of truth for table shape.
- **`api-spec/`** — `openapi.yaml` plus Orval config. Run `pnpm --filter @workspace/api-spec run codegen` after editing the spec.
- **`api-client-react/`** — Orval-generated TanStack Query hooks consumed by both frontends.
- **`api-zod/`** — Orval-generated Zod schemas used for request/response validation on the server.
- **`integrations-openai/`** and **`integrations-openrouter-ai/`** — thin wrappers around the OpenAI and OpenRouter SDKs.

---

## Tech stack

**Frontend (mobile)** Expo + React Native, Expo Router, TanStack Query, Nativewind, Lucide icons.
**Frontend (web)** Vite + React, Wouter, TanStack Query, Tailwind, Radix UI primitives.
**Backend** Node + Express, Drizzle ORM on Postgres, Sharp for image processing, Google Cloud Storage via Replit's object storage sidecar.
**AI** OpenAI GPT-4o / GPT-5.4 for vision extraction and scoring; OpenRouter (Grok-4.20) for the wingman chat and long-form briefs; Whisper for voice debrief transcription.
**Realtime** Server-Sent Events for streaming wingman chat tokens to the mobile client.
**Tooling** pnpm workspaces, TypeScript project references, Orval for OpenAPI → client/zod codegen.

---

## Features

### Match lifecycle
- Pull a match in by uploading 1–12 screenshots. Vision extraction runs in the background and fills in name, job, location, interests, transcript, and three scores (chemistry, sex potential, conversion).
- Status flows through `active → archived → ghosted`, with an **auto-archive banner** that surfaces matches who have gone quiet long enough to clean up.
- **Freshness tracking** — every score and prep brief stores the screenshot count and a content hash of date-related fields. When you add a screenshot, log a past date, change the upcoming-date details, or edit notes, the relevant card flips to "stale" with a reason ("3 new screenshots since", "Date details updated", "Older than 5 days") so you know exactly why to refresh.

### AI features
- **Wingman chat (Grok-4.20)** — streaming SSE chat with a "tactically sharp wingman" persona. The system prompt is injected with the full match context (profile, notes, transcript, date history) on every turn.
- **Cheat Sheet** — three labeled reply suggestions (Playful, Curious, Direct) for the latest 12 turns of the chat.
- **Pre-date Brief** — Markdown dossier with opening moves, topics to bring up, topics to avoid, and an escalation plan. Cached and only regenerated when context actually changes.
- **Red Flag Radar** — flags concerning patterns across the transcript.
- **Voice Debrief** — record a voice memo after the date, Whisper transcribes it, GPT updates the scores and suggests next moves.
- **Stale Nudges** — finds matches who haven't replied in 36+ hours and drafts re-engagement openers.

### Other surfaces
- **Photo gallery** per match
- **Tags & filters** with a tag-event audit log (manual vs AI-suggested)
- **Response-time analyzer** showing reply cadence
- **Conversion funnel analytics** across all matches
- **Weekly debrief** screen

---

## Database

Postgres via Drizzle. The important tables (schema lives in `lib/db/src/schema/`):

- `matches` — name, status, vibe tags, extracted profile (JSONB), transcript (JSONB), date history (JSONB), upcoming date details, `last_date_brief` snapshot with content hash.
- `screenshots` — per-image metadata, links to `match_id`, tracks `extraction_status` (`pending | done | failed`).
- `match_score_history` — score changes over time.
- `conversations` & `messages` — wingman chat history, optionally scoped to a match.
- `match_tag_events` — audit log for every tag add/remove.

Push schema changes with `pnpm --filter @workspace/db run push`.

---

## Running locally

The repo is set up for Replit, where each artifact runs as a workflow on its own port. To run elsewhere:

```bash
pnpm install
pnpm --filter @workspace/api-server run dev          # Express API
pnpm --filter @workspace/bumble-mobile run dev       # Expo (Haystack)
pnpm --filter @workspace/bumble-reply run dev        # Web companion
pnpm --filter @workspace/mockup-sandbox run dev      # Component preview sandbox
```

Useful one-offs:

```bash
pnpm --filter @workspace/api-spec run codegen        # regen API client + Zod after editing openapi.yaml
pnpm --filter @workspace/db run push                 # push Drizzle schema to the database
pnpm typecheck                                       # typecheck the whole workspace
```

---

## Environment variables

Set these in Replit's Secrets pane (or your local `.env`):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string. |
| `OPENAI_API_KEY` | Vision extraction, scoring, Whisper. |
| `OPENROUTER_API_KEY` | Grok wingman chat + long-form briefs. |
| `PRIVATE_OBJECT_DIR` | Object-storage bucket path for screenshots. |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Public-asset search paths. |
| `EXPO_PUBLIC_DOMAIN` | The API server's public domain, baked into the mobile app at build time. |

---

## Project conventions

- **OpenAPI is the contract.** Don't hand-edit `api-client-react` or `api-zod` — change `lib/api-spec/openapi.yaml` and run codegen. The server consumes the generated Zod schemas; the frontends consume the generated TanStack hooks.
- **Background extraction.** Screenshot uploads return immediately and fan out extraction work asynchronously so the UI never blocks on AI calls.
- **Freshness via content hashes.** Anything cached on a match (scores, prep brief, etc.) stores a short sha256 hash of the inputs it was derived from. Reads recompute the hash and flag staleness on mismatch — this is what lets the UI explain *why* something is out of date instead of just nagging.
- **No virtualenvs / Docker.** This is a Replit project; package management goes through the Replit tooling and pnpm.

---

## Repo layout

```
artifacts/
  api-server/          Express API + AI orchestration
  bumble-mobile/       Expo app (Haystack)
  bumble-reply/        Vite + React web companion
  mockup-sandbox/      Component preview sandbox
lib/
  api-spec/            openapi.yaml + Orval config
  api-client-react/    generated TanStack Query hooks
  api-zod/             generated Zod schemas
  db/                  Drizzle schema + client
  integrations-openai/
  integrations-openrouter-ai/
docs/                  PRDs and notes
scripts/               build + automation
```
