# AI Cost Observability Foundation

Date: 2026-05-31

## Stage 1 Findings

HeyTelli has three relevant surfaces:

- Mobile app: Expo/React Native in `artifacts/bumble-mobile`.
- API/server layer: Express in `artifacts/api-server`, mounted under `/api`.
- Storage: Drizzle/Postgres in `lib/db`, with SQL migrations in `lib/db/migrations`.

The mobile app does not need provider keys. It uploads screenshots/audio and calls the API. Model provider calls are server-side today, mainly in:

- `artifacts/api-server/src/lib/extraction.ts` for screenshot/profile/chat extraction and media placeholder repair.
- `artifacts/api-server/src/lib/audio.ts` for audio transcription.
- `artifacts/api-server/src/lib/voiceDebrief.ts` and `voiceFeedback.ts` for post-date/voice analysis.
- `artifacts/api-server/src/lib/cheatSheet.ts` for reply suggestions.
- `artifacts/api-server/src/lib/redFlagRadar.ts`, `tagSuggestions.ts`, `nudges.ts`, `weeklyDebrief.ts`, and `userProfileAnalysis.ts` for analysis/suggestions.
- `artifacts/api-server/src/routes/chat.ts` for chat/date brief completions.

OCR and import cleanup live across:

- Mobile import/upload: `artifacts/bumble-mobile/app/add.tsx`, `artifacts/bumble-mobile/app/match/[id].tsx`, and upload helpers in `artifacts/bumble-mobile/lib`.
- API upload/storage/import: `artifacts/api-server/src/routes/matches.ts`, `storage.ts`, `objectStorage.ts`, and `extraction.ts`.

Calm Read is currently mostly deterministic UI/modeling on mobile:

- `artifacts/bumble-mobile/lib/calm-read.ts`
- `artifacts/bumble-mobile/components/CalmReadCard.tsx`

The server-side raw material for Calm Read and pattern analysis comes from extraction, match reads, red flag radar, tag suggestions, and debrief flows.

## Insertion Point

The cost spine should be server-only:

- Add `ai_usage_events` in `lib/db`.
- Add API-server modules for pricing, usage normalization/recording, budget guards, and model routing.
- Replace direct provider calls in API code with router helpers over time.
- Add an admin-only usage summary route under the existing authenticated/admin route pattern.

## Implementation Steps

1. Add tests first for:
   - Pricing lookup and inferred cost.
   - Provider-returned cost override.
   - Usage normalization and safe failure behavior.
   - Disabled model-call fallback.
   - Router recording feature/user/match IDs.
   - Admin usage summary aggregation.

2. Add database schema and migration:
   - `lib/db/src/schema/aiUsageEvents.ts`
   - `lib/db/migrations/0006_ai_usage_events.sql`
   - Export from `lib/db/src/schema/index.ts`.

3. Add central API-server modules:
   - `aiPricing.ts`
   - `aiUsage.ts`
   - `aiBudgetGuards.ts`
   - `modelRouter.ts`
   - `aiUsageSummary.ts`

4. Add admin route:
   - `artifacts/api-server/src/routes/aiUsage.ts`
   - Mount in `artifacts/api-server/src/routes/index.ts`.

5. Wire highest-value model calls through the router first:
   - Extraction/OCR import.
   - Reply suggestions.
   - Red flag/pattern radar.
   - Voice debrief/audio transcription where feasible.

6. Document env vars and local test/migration steps.

## Guardrails

- Do not store raw conversations, screenshots, transcripts, prompts, or dating content in `ai_usage_events`.
- Metadata can store safe IDs, counts, route names, prompt versions, and schema versions.
- Usage logging must never break the user-facing AI flow.
- Provider keys remain server-side only.
- Pricing stays centralized and configurable; feature logic must not hardcode token pricing.
