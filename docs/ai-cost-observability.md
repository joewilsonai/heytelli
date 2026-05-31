# AI Cost Observability

HeyTelli records server-side AI usage in `ai_usage_events` so product costs can be measured without storing raw dating content.

## What Gets Tracked

Each event can include:

- Feature: `calm_read`, `ocr_cleanup`, `pattern_extraction`, `reply_suggestion`, `post_date_debrief`, `date_plan_share`, and related feature IDs.
- Context IDs: `user_id`, `match_id`, and `conversation_id` when the caller has them.
- Provider/model: `openai`, `openrouter`, `anthropic`, `litellm`, `local`, or `mock`.
- Usage: input, output, cached input, reasoning, image, audio, and total token counts.
- Cost: provider-returned cost when available, otherwise inferred from the central pricing registry.
- Operations: latency, success/failure, error type, redacted error message, retry count, prompt version, and response schema version.

The table must not contain raw screenshots, transcripts, prompts, messages, full profile text, or other sensitive dating content. Metadata is sanitized and should only contain safe counts, IDs, booleans, route names, and version labels.

## Main Files

- Ledger schema: `lib/db/src/schema/aiUsageEvents.ts`
- Migration: `lib/db/migrations/0006_ai_usage_events.sql`
- Pricing registry: `artifacts/api-server/src/lib/aiPricing.ts`
- Safe ledger writer: `artifacts/api-server/src/lib/aiUsage.ts`
- Budget guards: `artifacts/api-server/src/lib/aiBudgetGuards.ts`
- Model router: `artifacts/api-server/src/lib/modelRouter.ts`
- Admin summary: `artifacts/api-server/src/lib/aiUsageSummary.ts`
- Admin route: `GET /api/admin/ai-usage/summary`

## Configuration

Required provider keys stay server-side. The mobile app should never call OpenAI, Anthropic, OpenRouter, Langfuse, or LiteLLM directly.

Current provider env:

```bash
AI_INTEGRATIONS_OPENAI_BASE_URL=https://api.openai.com/v1
AI_INTEGRATIONS_OPENAI_API_KEY=...
```

AI cost/control env:

```bash
# Emergency stop. When true/1/yes, model calls return a safe fallback and record a disabled event.
AI_MODEL_CALLS_DISABLED=false

# Optional monthly warning threshold used by the admin summary response.
AI_MONTHLY_BUDGET_WARNING_USD=250

# Optional route defaults.
AI_MODEL_DEFAULT_PROVIDER=openai
AI_MODEL_DEFAULT_MODEL=gpt-5.4
AI_MODEL_CHEAP_MODEL=gpt-5.4
AI_MODEL_STRONG_MODEL=gpt-5.4
AI_MODEL_SAFETY_ESCALATION_MODEL=gpt-5.4
AI_MODEL_OCR_CLEANUP_MODEL=gpt-5.4
AI_AUDIO_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe

# Optional JSON pricing overrides. Values replace the central registry by provider/model.
AI_USAGE_PRICING_OVERRIDES_JSON='[
  {
    "provider": "openai",
    "model": "gpt-5.4",
    "inputCostPer1MTokens": 0,
    "outputCostPer1MTokens": 0,
    "cachedInputCostPer1MTokens": 0,
    "effectiveAt": "2026-05-31"
  }
]'
```

The default registry intentionally uses zero-dollar entries for private/current model names whose pricing is not confirmed in the repo. Set `AI_USAGE_PRICING_OVERRIDES_JSON` with real contracted prices to make spend totals meaningful.

## Migration

Apply the SQL migration before relying on the endpoint in a deployed environment:

```bash
psql "$DATABASE_URL" -f lib/db/migrations/0006_ai_usage_events.sql
```

Or use the existing Drizzle workflow if that is how the target environment is managed:

```bash
pnpm --dir lib/db run push
```

## Admin Summary

`GET /api/admin/ai-usage/summary` requires normal auth plus an admin user role.

It returns:

- Total AI spend today.
- Total AI spend last 7 days.
- Spend by feature.
- Spend by provider/model.
- Average cost per Calm Read.
- Average latency by feature.
- Error and retry counts.
- Top expensive features.
- Model call counts by feature.
- Monthly budget warning status when configured.

## Current Routing Coverage

The API server routes these call sites through `modelRouter.ts`:

- Screenshot extraction and media placeholder repair.
- Reply suggestions and stale nudge openers.
- Red flag/pattern radar and tag suggestions.
- Weekly debrief.
- Voice note critique.
- Voice debrief/post-date analysis.
- Audio transcription.
- User profile screenshot analysis.
- Chat stream.
- Date brief generation.

The deterministic mobile Calm Read card does not call a model by itself, so it does not create usage events unless a server-side analysis/import path runs.

## Langfuse

No existing Langfuse package or trace pattern was present in the repo at this pass. The internal ledger remains the source of truth. A future PR can add optional Langfuse spans from `modelRouter.ts` without changing feature code.
