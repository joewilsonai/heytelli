# Feedback To Feature Factory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make beta feedback visibly flow from private user submission to agent work, release proof, or a durable not-planned decision that can be reconsidered when enough users ask.

**Architecture:** Add a privacy-safe event/timeline read model over the existing `improvement_signals`, `improvement_work_items`, `improvement_runs`, and `improvement_trace_spans` tables. Keep private payloads in the database, expose only sanitized user/admin summaries, and let scripts own infrastructure cleanup/reconciliation.

**Tech Stack:** TypeScript, Express, Drizzle/Postgres, Expo React Native, Vite React, OpenAPI codegen, Node test runner, GitHub CLI-backed swarm scripts.

## Global Constraints

- Do not expose raw feedback payloads, GitHub URLs, PR URLs, issue bodies, screenshots, transcripts, tokens, or private match details to `/improvement/signals/mine`.
- The mobile Settings first screen remains the real product surface for beta users; no marketing-style landing page.
- GitHub remains a sanitized private-repo handoff only; private signal detail stays in Postgres.
- Cleanup and reconciliation must be script-owned, not dependent on a human assistant manually deleting branches or worktrees.
- Release proof must be represented in status/timeline data before a user sees feedback as shipped.

---

### Task 1: Feedback Timeline Read Model

**Files:**
- Modify: `artifacts/api-server/src/lib/improvementStatus.ts`
- Modify: `artifacts/api-server/src/lib/improvementStatus.test.ts`
- Modify: `artifacts/api-server/src/routes/improvement.ts`
- Modify: `lib/api-spec/openapi.yaml`
- Regenerate: `lib/api-client-react/src/generated/*`, `lib/api-zod/src/generated/*`

**Interfaces:**
- Produces: `FeedbackTimelineEvent { event: string; label: string; body: string; createdAt: Date | string; agentName: string | null; proof: string | null }`
- Produces: `UserFeedbackStatus.timeline: FeedbackTimelineEvent[]`
- Consumes: signal status, work item status/decision fields, matching runs for the work item.

- [ ] **Step 1: Write failing tests**

Add assertions in `artifacts/api-server/src/lib/improvementStatus.test.ts` that `buildUserFeedbackStatuses` returns a timeline containing `feedback_received`, `triaged`, `agent_work`, and final `shipped` or `not_planned` events without GitHub URLs.

- [ ] **Step 2: Implement read model**

Add `FeedbackTimelineRun`, `FeedbackTimelineEvent`, and timeline builders in `improvementStatus.ts`. Build events from sanitized signal/work item state plus `improvementRuns` rows.

- [ ] **Step 3: Wire route**

Select recent runs in `/improvement/signals/mine`, pass them to `buildUserFeedbackStatuses`, and keep the output privacy-safe.

- [ ] **Step 4: Update OpenAPI and generated clients**

Add `FeedbackTimelineEvent` and `timeline` to `UserFeedbackStatus`, then run `pnpm --filter @workspace/api-spec run codegen`.

- [ ] **Step 5: Verify**

Run `pnpm --filter @workspace/scripts exec tsx --test ../artifacts/api-server/src/lib/improvementStatus.test.ts ../artifacts/api-server/src/routes/improvement.test.ts`.

### Task 2: User Feedback Inbox In Settings

**Files:**
- Modify: `artifacts/bumble-mobile/app/settings.tsx`
- Modify: `artifacts/bumble-mobile/lib/improvement-feedback.ts`
- Modify: `artifacts/bumble-mobile/lib/improvement-feedback-ui.test.ts`
- Modify: `artifacts/bumble-mobile/lib/settings-ui.test.ts`

**Interfaces:**
- Consumes: `FeedbackStatus.timeline` from the generated API client.
- Produces: a compact timeline under each recent feedback status with agent/work/release proof copy.

- [ ] **Step 1: Write failing static UI tests**

Assert that Settings includes `Feedback timeline`, `timeline.map`, `Proof`, and user-safe labels for `Already available` and `Not planned`.

- [ ] **Step 2: Implement timeline UI**

Render up to three latest statuses, each with the current stage pill and a short timeline list. Keep cards compact, no nested cards, no raw issue/PR URLs.

- [ ] **Step 3: Verify**

Run `pnpm --filter @workspace/scripts exec tsx --test ../artifacts/bumble-mobile/lib/improvement-feedback-ui.test.ts ../artifacts/bumble-mobile/lib/settings-ui.test.ts`.

### Task 3: Admin/Demo Control-Room Snapshot

**Files:**
- Modify: `artifacts/api-server/src/lib/improvementStatus.ts`
- Modify: `artifacts/api-server/src/lib/improvementStatus.test.ts`
- Modify: `artifacts/api-server/src/routes/improvement.ts`
- Create: `artifacts/heytelli-web/src/pages/ImprovementControlRoom.tsx`
- Modify: `artifacts/heytelli-web/src/App.tsx`
- Modify: `artifacts/heytelli-web/src/components/AppShell.tsx`
- Modify: `artifacts/heytelli-web/src/styles.css`
- Modify: `artifacts/heytelli-web/src/app-contract.test.ts`

**Interfaces:**
- Produces: `/admin/improvement/control-room` returning queue counters, stage counts, reconsider candidates, recent agent runs, recent work items, and demo script steps.
- Consumes: generated API client functions for admin health/work item reads in the web page.

- [ ] **Step 1: Write failing backend and web static tests**

Assert the admin route exists, requires `requireAdmin`, and the web app exposes `/improvements` with control-room copy.

- [ ] **Step 2: Implement route/read model**

Create a sanitized control-room snapshot from work items and runs. Include no raw payloads.

- [ ] **Step 3: Implement web page**

Add a dense operational dashboard: queue cards, agent lane list, reconsider queue, recent work, and demo script.

- [ ] **Step 4: Verify**

Run `pnpm --filter @workspace/scripts exec tsx --test ../artifacts/api-server/src/lib/improvementStatus.test.ts ../artifacts/api-server/src/routes/improvement.test.ts ../artifacts/heytelli-web/src/app-contract.test.ts`.

### Task 4: Reconciler And Release-Proof Guardrails

**Files:**
- Create: `scripts/src/improvement/reconcile.ts`
- Create: `scripts/src/improvement/reconcile.test.ts`
- Modify: `scripts/package.json`
- Modify: `scripts/run-local-swarm-host.sh`
- Modify: `docs/swarm-agents.md`

**Interfaces:**
- Produces: `planImprovementReconciliation(input): ReconciliationAction[]`
- Produces script `pnpm --filter @workspace/scripts run improvement:reconcile`
- Consumes: local worktree/branch listings, DB work item state, GitHub issue/PR state.

- [ ] **Step 1: Write failing planner tests**

Cover stale generated worktree cleanup, local branch cleanup, stale `swarm-active` label, and closed PR/work item drift actions.

- [ ] **Step 2: Implement dry-run planner**

Return deterministic actions with reasons. Default to dry-run for safety.

- [ ] **Step 3: Add host hook**

Have `run-local-swarm-host.sh` run reconciliation before planning/execution and after lifecycle monitoring.

- [ ] **Step 4: Verify**

Run `pnpm --filter @workspace/scripts run test:improvement`.

### Task 5: Smarter Demand Clustering, Thresholds, And Demo Seed

**Files:**
- Modify: `artifacts/api-server/src/lib/improvementPipeline.ts`
- Modify: `artifacts/api-server/src/lib/improvementPipeline.test.ts`
- Modify: `scripts/src/improvement/triage.ts`
- Modify: `scripts/src/improvement/triage.test.ts`
- Create: `scripts/src/improvement/demoSeed.ts`
- Create: `scripts/src/improvement/demoSeed.test.ts`
- Modify: `scripts/package.json`
- Modify: `docs/swarm-agents.md`

**Interfaces:**
- Produces: `semanticClusterKeyForImprovement(input): string`
- Produces: `reconsiderThresholdForDecision(category): number`
- Produces script `pnpm --filter @workspace/scripts run improvement:demo-seed -- --dry-run`

- [ ] **Step 1: Write failing tests**

Verify phrasing variants like “more color themes” and “change app color” group to the same cluster key. Verify thresholds vary by decision category.

- [ ] **Step 2: Implement deterministic local clustering**

Normalize common beta-feedback synonyms and surfaces into a stable semantic cluster key. Keep this local and deterministic until embeddings are explicitly enabled.

- [ ] **Step 3: Apply clustering in triage**

Use semantic cluster keys for work-item fingerprints while keeping original signal fingerprints for auditability.

- [ ] **Step 4: Add demo seed dry-run**

Create synthetic privacy-safe demo signals for one shipped/already-available item, one not-planned item, one needs-more-signal cluster, and one actionable implementation request.

- [ ] **Step 5: Verify**

Run `pnpm --filter @workspace/scripts run test:improvement` and `pnpm run typecheck`.

### Task 6: Final Verification And PR Update

**Files:**
- Modify generated files as required by OpenAPI codegen.
- Modify PR #103 by pushing the current branch.

**Interfaces:**
- Consumes all tasks above.
- Produces an updated PR with verification notes.

- [ ] **Step 1: Run focused tests**

Run the task-specific tests listed above.

- [ ] **Step 2: Run broad gates**

Run `pnpm --filter @workspace/scripts run test:improvement`, `pnpm --filter @workspace/heytelli-web test`, `pnpm run typecheck`, and `git diff --check`.

- [ ] **Step 3: Commit and push**

Commit the implementation and push `codex/fix-beta-feedback-swarm-resolution`.
