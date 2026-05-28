# HeyTelli

HeyTelli is a private AI-assisted dating clarity app for women navigating modern online dating. It helps users import screenshots, reconstruct conversation timelines, record reflections, prepare for dates, and share optional Vibe Check image cards through the native share sheet.

The product is not a public review board, a "rate men" platform, a crowdsourced accusation network, a surveillance product, or an AI danger detector.

## Phase 1 Product Shape

- iOS-first mobile app built with Expo / React Native and EAS custom dev builds.
- Backend API for extraction, transcription, reflection assistant, and storage lifecycle.
- Internal/admin web console only. The consumer web app is Phase 2 after mobile retention is proven.
- Native sharing matters: "Share to HeyTelli" from Photos/share sheet is a critical ingestion path.

## Core Rules

- No ratings or verdicts about another person.
- No friend accounts, hosted dossiers, comments, reactions, or multi-user workspace.
- Vibe Check sharing is native image-card sharing, not a hosted profile.
- AI outputs neutral events, summaries, first-person reflection prompts, contextual observations, and grounding pulses.

## Repo Layout

```text
artifacts/
  api-server/          API and AI orchestration
  bumble-mobile/       Current Expo mobile app scaffold, becoming HeyTelli
  bumble-reply/        Current web companion, becoming internal/admin console
  mockup-sandbox/      Design sandbox
lib/
  api-spec/            OpenAPI contract
  api-client-react/    Generated API client
  api-zod/             Generated Zod schemas
  db/                  Drizzle schema and DB client
docs/
  heytelli-prd.md      Product source of truth
```

## Local Commands

```bash
pnpm install
pnpm typecheck
pnpm --filter @workspace/api-spec run codegen
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/bumble-mobile run dev
pnpm --filter @workspace/bumble-reply run dev
pnpm --filter @workspace/scripts run local-swarm-host:check
./scripts/run-swarm-executor.sh --dry-run --limit 5
```

Backend deployment setup lives in `docs/backend-setup.md`. The autonomous
feedback-to-PR runbook lives in `docs/mac-optional-improvement-loop.md`. The
default swarm host is Joe's Mac over Tailscale; it plans issues, opens executor
PRs from sanitized DB work items, and uses GitHub Actions as the manual fallback
planner.

## Required Environment

Secrets live outside the repo. Cloud runners should use GitHub, Railway, and
EAS secret stores. For local development, load API keys from:

```bash
source ~/.luna/secrets/keys.env
```
