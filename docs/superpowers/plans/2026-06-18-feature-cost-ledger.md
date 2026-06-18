# Feature Cost Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estimate and record beta-feature creation cost in dollars and effort units, then expose it in the admin improvement control room.

**Architecture:** Add pure feature-cost helpers in the swarm scripts, store estimate/actual summaries in `improvement_runs.metadata`, and aggregate those summaries in the API control-room snapshot. Use the existing AI pricing registry for model dollars and keep user-facing feedback timelines free of internal cost details.

**Tech Stack:** TypeScript, Node test runner, Drizzle metadata fields, Express, OpenAPI codegen, Vite React.

## Global Constraints

- No new database table for the first version; use `improvement_runs.metadata`.
- Pricing defaults must be overrideable through `AI_USAGE_PRICING_OVERRIDES_JSON`.
- Cost values are estimates unless exact provider cost is available.
- Do not expose internal dollars to beta users.
- Do not store prompts, transcripts, screenshots, tokens, API keys, or raw agent output in cost metadata.

---

### Task 1: Pricing Registry

**Files:**
- Modify: `artifacts/api-server/src/lib/aiPricing.ts`
- Test: `artifacts/api-server/src/lib/aiPricing.test.ts`

**Interfaces:**
- Consumes: `estimateAiUsageCostUsd(input, registry?)`
- Produces: current defaults for `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, and `gpt-5.3-codex`

- [ ] Add focused tests that assert non-zero default costs for the agent models.
- [ ] Update the default pricing registry.
- [ ] Run `pnpm --filter @workspace/api-server exec tsx --test ./src/lib/aiPricing.test.ts`.

### Task 2: Feature Cost Math

**Files:**
- Create: `scripts/src/improvement/featureCost.ts`
- Test: `scripts/src/improvement/featureCost.test.ts`

**Interfaces:**
- Produces: `estimateFeatureCreationCost`, `buildActualFeatureCreationCost`, and `extractCodexTotalTokens`
- Produces type: `FeatureCreationCostSummary`

- [ ] Add tests for risk-tier estimates, reviewer lane estimates, token parsing, actual cost, and cost per requesting user.
- [ ] Implement pure helpers with sanitized metadata only.
- [ ] Run `pnpm --filter @workspace/scripts exec tsx --test ./src/improvement/featureCost.test.ts`.

### Task 3: Executor Metadata

**Files:**
- Modify: `scripts/src/improvement/executor.ts`
- Test: `scripts/src/improvement/executor.test.ts`

**Interfaces:**
- Consumes: `estimateFeatureCreationCost` and `buildActualFeatureCreationCost`
- Produces: `featureCostEstimate` on started implementation runs and `featureCostActual` on succeeded or failed implementation runs

- [ ] Add tests for parsing/storing cost metadata from simulated Codex output.
- [ ] Capture agent stdout/stderr token totals without storing raw output.
- [ ] Persist estimate and actual summaries in run metadata.
- [ ] Run `pnpm --filter @workspace/scripts run test:improvement`.

### Task 4: API Control Room Aggregation

**Files:**
- Modify: `artifacts/api-server/src/lib/improvementStatus.ts`
- Test: `artifacts/api-server/src/lib/improvementStatus.test.ts`

**Interfaces:**
- Consumes: `improvement_runs.metadata.featureCostEstimate` and `featureCostActual`
- Produces: `ImprovementControlRoomWorkItem.featureCost`

- [ ] Add tests that aggregate estimate and actual cost into control-room work items.
- [ ] Include cost per requesting user and confidence.
- [ ] Ensure user feedback timelines do not include cost.
- [ ] Run the focused API status tests.

### Task 5: Web Control Room Display

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- Generated: API client/zod packages after codegen
- Modify: `artifacts/heytelli-web/src/pages/ImprovementControlRoom.tsx`
- Modify: `artifacts/heytelli-web/src/styles.css`
- Test: `artifacts/heytelli-web/src/app-contract.test.ts`

**Interfaces:**
- Consumes: `featureCost` fields from `/admin/improvement/control-room`
- Produces: visible estimate, actual, confidence, and effort text in the control room

- [ ] Update OpenAPI schema and regenerate clients.
- [ ] Render concise cost badges on work items.
- [ ] Add/adjust web contract tests.
- [ ] Run web tests and build.

### Task 6: Verification

**Files:**
- Modify docs if behavior changes during implementation.

- [ ] Run `pnpm --filter @workspace/scripts run test:improvement`.
- [ ] Run focused API tests for improvement status and AI pricing.
- [ ] Run `pnpm run typecheck`.
- [ ] Run `pnpm --filter @workspace/heytelli-web test`.
- [ ] Run `pnpm --filter @workspace/heytelli-web build`.
- [ ] Run `git diff --check`.
