# Autonomous Feedback Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build HeyTelli's V1 continuous improvement loop: beta users submit privacy-safe feedback in-app, the backend stores private raw signals, a worker sanitizes/classifies/dedupes them, creates GitHub issues when safe, and produces an operator digest.

**Architecture:** Add canonical `improvement_*` database tables beside existing `product_feedback`, keep user-submitted details private, and expose only sanitized summaries to GitHub automation. The API owns ingestion and admin reads; pure backend helpers own sanitization/classification/fingerprinting so route tests and worker tests share one policy. Mobile uses the generated API client and a small reusable feedback sheet.

**Tech Stack:** TypeScript, Express, Drizzle, PostgreSQL, OpenAPI/Orval/Zod, Expo Router, React Native, Node test runner, GitHub REST API via built-in `fetch`.

---

## File Structure

- Modify `.gitignore`: keep local `.worktrees/` out of git.
- Modify `artifacts/bumble-mobile/package.json` and `artifacts/bumble-mobile/tsconfig.json`: make existing Node-based static tests typecheck in the Expo package.
- Modify `artifacts/bumble-mobile/lib/import-routing.test.ts`: narrow discriminated-union access after asserting `mode`.
- Create `lib/db/src/schema/improvementPipeline.ts`: Drizzle schema and TypeScript types for signals, work items, and runs.
- Modify `lib/db/src/schema/index.ts`: export the new schema.
- Create `lib/db/migrations/0004_improvement_pipeline.sql`: additive tables and indexes.
- Modify `artifacts/api-server/src/lib/multiTenantSchema.test.ts`: assert the new tables preserve user ownership and private payload columns.
- Create `artifacts/api-server/src/lib/improvementPipeline.ts`: normalize client input, sanitize private payloads, compute fingerprints, classify severity/category/risk, build work item drafts, build GitHub issue text.
- Create `artifacts/api-server/src/lib/improvementPipeline.test.ts`: unit tests for sanitization, classification, fingerprinting, issue-body privacy, and dedupe keys.
- Modify `artifacts/api-server/src/lib/auth.ts`: add `requireAdmin`.
- Create `artifacts/api-server/src/routes/improvement.ts`: authenticated signal ingestion and admin listing endpoints.
- Modify `artifacts/api-server/src/routes/index.ts`: mount the improvement router.
- Create `artifacts/api-server/src/routes/improvement.test.ts`: static route regression tests for auth, match ownership, admin protection, and no screenshot/transcript ingestion.
- Modify `lib/api-spec/openapi.yaml`: add improvement paths and schemas.
- Regenerate `lib/api-zod/src/generated/**` and `lib/api-client-react/src/generated/**` with Orval.
- Create `scripts/src/improvement/github.ts`: GitHub issue client with dry-run mode.
- Create `scripts/src/improvement/triage.ts`: pure triage helpers plus CLI runner.
- Create `scripts/src/improvement/digest.ts`: digest builder and CLI output.
- Create `scripts/src/improvement/triage.test.ts`: dry-run worker tests for issue body, labels, blocked privacy risk, duplicate frequency, and digest counts.
- Modify `scripts/package.json`: add DB dependency and `improvement:triage`, `improvement:digest`, and test scripts.
- Create `artifacts/bumble-mobile/components/FeedbackSheet.tsx`: reusable bottom-sheet-like modal for feedback.
- Create `artifacts/bumble-mobile/lib/improvement-feedback.ts`: feedback type/surface copy plus submit wrapper.
- Modify `artifacts/bumble-mobile/app/settings.tsx`: add global "Send feedback" entry point.
- Modify `artifacts/bumble-mobile/app/match/[id].tsx`: convert beta check card to new feedback pipeline while keeping quick Yes/Maybe/No.
- Create `artifacts/bumble-mobile/lib/improvement-feedback-ui.test.ts`: static tests for feedback entry points, privacy reassurance, technical context consent, and no screenshot/transcript fields.

---

### Task 1: Stabilize Baseline Typecheck

**Files:**
- Modify: `artifacts/bumble-mobile/package.json`
- Modify: `artifacts/bumble-mobile/tsconfig.json`
- Modify: `artifacts/bumble-mobile/lib/import-routing.test.ts`

- [ ] **Step 1: Verify the existing baseline failure**

Run:

```bash
pnpm run typecheck
```

Expected: fails in `artifacts/bumble-mobile` because Node test modules are not typed and `result.match` is read after only checking `mode` with Node assert.

- [ ] **Step 2: Add a local typecheck regression test by re-running the narrow package check**

Run:

```bash
pnpm --filter @workspace/bumble-mobile run typecheck
```

Expected: the same mobile package failures show the branch starts red.

- [ ] **Step 3: Give the Expo package Node test types**

Patch `artifacts/bumble-mobile/package.json` devDependencies with:

```json
"@types/node": "catalog:"
```

Patch `artifacts/bumble-mobile/tsconfig.json` compiler options with:

```json
"types": ["node"]
```

- [ ] **Step 4: Narrow the import-routing test before reading `match`**

Patch the first test in `artifacts/bumble-mobile/lib/import-routing.test.ts`:

```ts
  assert.equal(result.mode, "existing");
  if (result.mode !== "existing") {
    assert.fail(`Expected existing match, got ${result.mode}`);
  }
  assert.equal(result.match.id, 1);
```

- [ ] **Step 5: Verify mobile typecheck passes**

Run:

```bash
pnpm --filter @workspace/bumble-mobile run typecheck
```

Expected: `@workspace/bumble-mobile` typecheck passes.

- [ ] **Step 6: Commit**

```bash
git add artifacts/bumble-mobile/package.json artifacts/bumble-mobile/tsconfig.json artifacts/bumble-mobile/lib/import-routing.test.ts pnpm-lock.yaml
git commit -m "test: stabilize mobile typecheck baseline"
```

---

### Task 2: Add Improvement Pipeline Schema

**Files:**
- Create: `lib/db/src/schema/improvementPipeline.ts`
- Modify: `lib/db/src/schema/index.ts`
- Create: `lib/db/migrations/0004_improvement_pipeline.sql`
- Modify: `artifacts/api-server/src/lib/multiTenantSchema.test.ts`

- [ ] **Step 1: Extend the schema regression test first**

Patch `artifacts/api-server/src/lib/multiTenantSchema.test.ts` import block:

```ts
const {
  conversations,
  improvementRuns,
  improvementSignals,
  improvementWorkItems,
  matches,
  productFeedback,
  users,
} = await import("@workspace/db");
```

Add assertions inside the existing test:

```ts
  assert.ok(
    improvementSignals.userId,
    "improvement signals must retain the signed-in user's tenant",
  );
  assert.ok(
    improvementSignals.rawPayload,
    "improvement signals must keep raw payload private in the database",
  );
  assert.ok(
    improvementWorkItems.signalIds,
    "improvement work items must retain private source signal ids",
  );
  assert.ok(
    improvementRuns.workItemId,
    "improvement runs must be linked to one work item",
  );
```

- [ ] **Step 2: Run the test and watch it fail**

Run:

```bash
NODE_OPTIONS='--conditions=workspace' pnpm exec tsx --test artifacts/api-server/src/lib/multiTenantSchema.test.ts
```

Expected: fails because the `improvement*` exports do not exist.

- [ ] **Step 3: Create Drizzle schema**

Create `lib/db/src/schema/improvementPipeline.ts` with these exported tables and types:

```ts
import {
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

import { matches } from "./matches";
import { users } from "./users";

export type ImprovementSignalSource =
  | "in_app_feedback"
  | "client_error"
  | "api_error"
  | "analysis_failure"
  | "auth_failure"
  | "share_failure"
  | "analytics"
  | "crash"
  | "system_monitor";
export type ImprovementSeverity = "info" | "low" | "medium" | "high" | "critical";
export type ImprovementPrivacyRisk = "low" | "medium" | "high" | "blocked";
export type ImprovementSignalStatus =
  | "new"
  | "triaged"
  | "grouped"
  | "actionable"
  | "waiting_for_signal"
  | "blocked"
  | "resolved"
  | "ignored";
export type ImprovementCategory =
  | "bug"
  | "ux_confusion"
  | "feature_request"
  | "safety_issue"
  | "performance"
  | "reliability"
  | "privacy"
  | "copy"
  | "docs"
  | "test";
export type ImprovementPriority = "p0" | "p1" | "p2" | "p3";
export type ImprovementRiskTier =
  | "safe_auto_merge"
  | "guarded_auto_merge"
  | "extra_agent_review"
  | "no_auto_merge";
export type ImprovementWorkItemStatus =
  | "draft"
  | "issue_created"
  | "researching"
  | "planned"
  | "building"
  | "reviewing"
  | "changes_requested"
  | "checks_running"
  | "merged"
  | "deployed"
  | "monitoring"
  | "rolled_back"
  | "closed";
export type ImprovementRunType =
  | "triage"
  | "research"
  | "implementation"
  | "review"
  | "merge"
  | "deploy"
  | "monitor"
  | "rollback";
export type ImprovementRunStatus = "started" | "succeeded" | "failed" | "blocked";

export const improvementSignals = pgTable("improvement_signals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  matchId: integer("match_id").references(() => matches.id, { onDelete: "set null" }),
  source: text("source").$type<ImprovementSignalSource>().notNull(),
  severity: text("severity").$type<ImprovementSeverity>().notNull().default("low"),
  rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull().default({}),
  sanitizedSummary: text("sanitized_summary"),
  sanitizedPayload: jsonb("sanitized_payload").$type<Record<string, unknown>>(),
  privacyRisk: text("privacy_risk").$type<ImprovementPrivacyRisk>().notNull().default("low"),
  fingerprint: text("fingerprint").notNull(),
  status: text("status").$type<ImprovementSignalStatus>().notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const improvementWorkItems = pgTable("improvement_work_items", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  category: text("category").$type<ImprovementCategory>().notNull(),
  priority: text("priority").$type<ImprovementPriority>().notNull().default("p3"),
  riskTier: text("risk_tier").$type<ImprovementRiskTier>().notNull().default("safe_auto_merge"),
  impactScore: integer("impact_score").notNull().default(1),
  confidenceScore: integer("confidence_score").notNull().default(1),
  frequencyCount: integer("frequency_count").notNull().default(1),
  signalIds: jsonb("signal_ids").$type<number[]>().notNull().default([]),
  githubIssueUrl: text("github_issue_url"),
  githubIssueNumber: integer("github_issue_number"),
  branchName: text("branch_name"),
  pullRequestUrl: text("pull_request_url"),
  pullRequestNumber: integer("pull_request_number"),
  status: text("status").$type<ImprovementWorkItemStatus>().notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const improvementRuns = pgTable("improvement_runs", {
  id: serial("id").primaryKey(),
  workItemId: integer("work_item_id")
    .notNull()
    .references(() => improvementWorkItems.id, { onDelete: "cascade" }),
  runType: text("run_type").$type<ImprovementRunType>().notNull(),
  agentName: text("agent_name").notNull(),
  status: text("status").$type<ImprovementRunStatus>().notNull(),
  summary: text("summary").notNull(),
  logsUrl: text("logs_url"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const insertImprovementSignalSchema = createInsertSchema(improvementSignals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertImprovementWorkItemSchema = createInsertSchema(improvementWorkItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertImprovementRunSchema = createInsertSchema(improvementRuns).omit({
  id: true,
  createdAt: true,
});

export type ImprovementSignal = typeof improvementSignals.$inferSelect;
export type InsertImprovementSignal = typeof improvementSignals.$inferInsert;
export type ImprovementWorkItem = typeof improvementWorkItems.$inferSelect;
export type InsertImprovementWorkItem = typeof improvementWorkItems.$inferInsert;
export type ImprovementRun = typeof improvementRuns.$inferSelect;
export type InsertImprovementRun = typeof improvementRuns.$inferInsert;
```

- [ ] **Step 4: Export schema**

Patch `lib/db/src/schema/index.ts`:

```ts
export * from "./improvementPipeline";
```

- [ ] **Step 5: Add migration**

Create `lib/db/migrations/0004_improvement_pipeline.sql` with additive `CREATE TABLE IF NOT EXISTS` statements for `improvement_signals`, `improvement_work_items`, and `improvement_runs`; include indexes on signal status/fingerprint/user, work item status/priority, and run work item id.

- [ ] **Step 6: Verify**

Run:

```bash
NODE_OPTIONS='--conditions=workspace' pnpm exec tsx --test artifacts/api-server/src/lib/multiTenantSchema.test.ts
pnpm run typecheck:libs
```

Expected: schema regression test and library typecheck pass.

- [ ] **Step 7: Commit**

```bash
git add lib/db/src/schema/improvementPipeline.ts lib/db/src/schema/index.ts lib/db/migrations/0004_improvement_pipeline.sql artifacts/api-server/src/lib/multiTenantSchema.test.ts
git commit -m "feat: add improvement pipeline schema"
```

---

### Task 3: Add Sanitization, Classification, and Issue Policy

**Files:**
- Create: `artifacts/api-server/src/lib/improvementPipeline.ts`
- Create: `artifacts/api-server/src/lib/improvementPipeline.test.ts`

- [ ] **Step 1: Write failing policy tests**

Create tests covering:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGithubIssueDraft,
  buildImprovementWorkItemDraft,
  fingerprintImprovementSignal,
  normalizeImprovementSignalInput,
  sanitizeImprovementPayload,
} from "./improvementPipeline";

test("sanitizes private dating details before issue creation", () => {
  const normalized = normalizeImprovementSignalInput({
    source: "in_app_feedback",
    type: "Bug",
    message:
      "Gretchen texted me at 314-555-0199 and the app showed our transcript screenshot raw.",
    surface: "match-read",
    clientContext: {
      platform: "ios",
      buildNumber: "3",
      transcript: "full private message",
      screenshot: "data:image/png;base64,abc",
    },
    technicalContextConsent: true,
  });
  assert.ok(normalized);

  const sanitized = sanitizeImprovementPayload(normalized.rawPayload);

  assert.equal(sanitized.privacyRisk, "blocked");
  assert.doesNotMatch(sanitized.summary, /314-555-0199/);
  assert.doesNotMatch(JSON.stringify(sanitized.sanitizedPayload), /transcript|data:image/);
});

test("classifies safety concern as high-review work", () => {
  const normalized = normalizeImprovementSignalInput({
    source: "in_app_feedback",
    type: "Safety concern",
    message: "The date escape flow was confusing while I felt unsafe.",
    surface: "date-mode",
    technicalContextConsent: true,
  });
  assert.ok(normalized);

  const workItem = buildImprovementWorkItemDraft({
    signalId: 12,
    sanitizedSummary: "The date escape flow was confusing while user felt unsafe.",
    sanitizedPayload: normalized.rawPayload,
    privacyRisk: "high",
    fingerprint: fingerprintImprovementSignal(normalized),
  });

  assert.equal(workItem.category, "safety_issue");
  assert.equal(workItem.riskTier, "extra_agent_review");
  assert.equal(workItem.priority, "p1");
});

test("github issue body includes sanitized reproduction context only", () => {
  const draft = buildGithubIssueDraft({
    title: "Feedback: Upload fails on settings",
    summary: "Profile analysis failed on iOS build 3.",
    category: "bug",
    priority: "p2",
    riskTier: "safe_auto_merge",
    frequencyCount: 2,
    signalIds: [1, 2],
    sanitizedPayload: {
      surface: "settings-profile",
      platform: "ios",
      buildNumber: "3",
      message: "Profile analysis failed.",
    },
  });

  assert.match(draft.body, /No private screenshots\/transcripts included/);
  assert.doesNotMatch(draft.body, /signalIds|314-555|transcript|screenshot/);
  assert.deepEqual(draft.labels, [
    "feedback",
    "bug",
    "priority:p2",
    "risk:safe_auto_merge",
    "agent-ready",
  ]);
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run:

```bash
NODE_OPTIONS='--conditions=workspace' pnpm exec tsx --test artifacts/api-server/src/lib/improvementPipeline.test.ts
```

Expected: fails because the helper module does not exist.

- [ ] **Step 3: Implement the policy helper**

Implement exported functions:

- `normalizeImprovementSignalInput(input)`
- `sanitizeImprovementPayload(rawPayload)`
- `fingerprintImprovementSignal(normalized)`
- `buildImprovementWorkItemDraft(input)`
- `buildGithubIssueDraft(workItemLike)`

Required behaviors:

- Message max length: `1200`.
- Surface max length: `80`.
- Client context allowlist: `platform`, `buildNumber`, `appVersion`, `route`, `method`, `status`, `errorCode`.
- Strip emails, phone numbers, data URLs, raw transcript/screenshot/image keys, and exact-looking addresses.
- Mark `privacyRisk` `blocked` when raw transcript/screenshot/image content is attempted; mark `high` for safety concerns; otherwise `low` or `medium`.
- Fingerprint from lowercased `source`, normalized `type`, `surface`, and sanitized summary bucket.
- Risk tier: copy/docs/test to `safe_auto_merge`; safety/privacy/auth/storage/deletion to `extra_agent_review`; unclear/private exposure to `no_auto_merge`; backend behavior to `guarded_auto_merge`.

- [ ] **Step 4: Verify**

Run:

```bash
NODE_OPTIONS='--conditions=workspace' pnpm exec tsx --test artifacts/api-server/src/lib/improvementPipeline.test.ts
pnpm --filter @workspace/api-server run typecheck
```

Expected: policy tests and API server typecheck pass.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/improvementPipeline.ts artifacts/api-server/src/lib/improvementPipeline.test.ts
git commit -m "feat: add improvement triage policy"
```

---

### Task 4: Add Improvement API and Generated Client

**Files:**
- Modify: `artifacts/api-server/src/lib/auth.ts`
- Create: `artifacts/api-server/src/routes/improvement.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`
- Create: `artifacts/api-server/src/routes/improvement.test.ts`
- Modify: `lib/api-spec/openapi.yaml`
- Regenerate: `lib/api-zod/src/generated/**`
- Regenerate: `lib/api-client-react/src/generated/**`

- [ ] **Step 1: Write failing route regression tests**

Create `artifacts/api-server/src/routes/improvement.test.ts` static tests:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("./improvement.ts", import.meta.url), "utf8");
const index = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const auth = readFileSync(new URL("../lib/auth.ts", import.meta.url), "utf8");

test("improvement signal route protects private beta feedback", () => {
  assert.match(route, /requireAuth/);
  assert.match(route, /requireUserId\(req\)/);
  assert.match(route, /CreateImprovementSignalBody/);
  assert.match(route, /normalizeImprovementSignalInput/);
  assert.match(route, /sanitizeImprovementPayload/);
  assert.match(route, /fingerprintImprovementSignal/);
  assert.match(route, /eq\(matches\.userId,\s*userId\)/);
  assert.doesNotMatch(route, /screenshotObjectPath|transcriptText|rawTranscript/);
});

test("improvement admin routes require admin role", () => {
  assert.match(auth, /function requireAdmin|export function requireAdmin/);
  assert.match(route, /requireAdmin/);
  assert.match(route, /\/admin\/improvement\/signals/);
  assert.match(route, /\/admin\/improvement\/work-items/);
});

test("improvement router is mounted", () => {
  assert.match(index, /improvementRouter/);
  assert.match(index, /router\.use\(improvementRouter\)/);
});
```

- [ ] **Step 2: Run tests and watch them fail**

Run:

```bash
NODE_OPTIONS='--conditions=workspace' pnpm exec tsx --test artifacts/api-server/src/routes/improvement.test.ts
```

Expected: fails because route and admin middleware do not exist.

- [ ] **Step 3: Add admin middleware**

Patch `artifacts/api-server/src/lib/auth.ts` with:

```ts
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.auth?.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
```

- [ ] **Step 4: Add route**

Create `artifacts/api-server/src/routes/improvement.ts` with:

- `router.use(requireAuth)`
- `POST /improvement/signals`: parse `CreateImprovementSignalBody`, verify optional `matchId` belongs to `userId`, normalize, sanitize, fingerprint, insert `improvementSignals`, return `201`.
- `GET /admin/improvement/signals`: `requireAdmin`, return latest 50 signals.
- `GET /admin/improvement/work-items`: `requireAdmin`, return latest 50 work items.
- `GET /admin/improvement/work-items/:id`: `requireAdmin`, return one work item or `404`.

- [ ] **Step 5: Mount route**

Patch `artifacts/api-server/src/routes/index.ts`:

```ts
import improvementRouter from "./improvement";
router.use(improvementRouter);
```

- [ ] **Step 6: Add OpenAPI paths and schemas**

Patch `lib/api-spec/openapi.yaml`:

- Add tag `improvement`.
- Add `POST /improvement/signals` with operationId `createImprovementSignal`.
- Add admin GET paths with operationIds `listImprovementSignals`, `listImprovementWorkItems`, `getImprovementWorkItem`.
- Add schemas `ImprovementSignalInput`, `ImprovementSignal`, `ImprovementWorkItem`, and `ImprovementRun` with enum values:
  - `source`: `in_app_feedback`, `client_error`, `api_error`, `analysis_failure`, `auth_failure`, `share_failure`, `analytics`, `crash`, `system_monitor`
  - `type`: `Bug`, `Confusing`, `Idea`, `Safety concern`, `Love this`
  - `severity`: `info`, `low`, `medium`, `high`, `critical`
  - `privacyRisk`: `low`, `medium`, `high`, `blocked`
  - `status`: `new`, `triaged`, `grouped`, `actionable`, `waiting_for_signal`, `blocked`, `resolved`, `ignored`
  - `category`: `bug`, `ux_confusion`, `feature_request`, `safety_issue`, `performance`, `reliability`, `privacy`, `copy`, `docs`, `test`
  - `priority`: `p0`, `p1`, `p2`, `p3`
  - `riskTier`: `safe_auto_merge`, `guarded_auto_merge`, `extra_agent_review`, `no_auto_merge`

- [ ] **Step 7: Regenerate generated clients**

Run:

```bash
pnpm --filter @workspace/api-spec run codegen
```

Expected: generated API client and Zod schemas include `createImprovementSignal` and `CreateImprovementSignalBody`.

- [ ] **Step 8: Verify**

Run:

```bash
NODE_OPTIONS='--conditions=workspace' pnpm exec tsx --test artifacts/api-server/src/routes/improvement.test.ts
pnpm --filter @workspace/api-server run typecheck
pnpm run typecheck:libs
```

Expected: route tests, API server typecheck, and library typecheck pass.

- [ ] **Step 9: Commit**

```bash
git add artifacts/api-server/src/lib/auth.ts artifacts/api-server/src/routes/improvement.ts artifacts/api-server/src/routes/index.ts artifacts/api-server/src/routes/improvement.test.ts lib/api-spec/openapi.yaml lib/api-zod/src/generated lib/api-client-react/src/generated
git commit -m "feat: add improvement signal api"
```

---

### Task 5: Add Worker, GitHub Issue Creation, and Digest

**Files:**
- Create: `scripts/src/improvement/github.ts`
- Create: `scripts/src/improvement/triage.ts`
- Create: `scripts/src/improvement/digest.ts`
- Create: `scripts/src/improvement/triage.test.ts`
- Modify: `scripts/package.json`

- [ ] **Step 1: Write failing worker tests**

Create tests that call pure helpers without a real DB:

- `planSignalTriage` converts a sanitized signal into a work item.
- duplicate fingerprints increment `frequencyCount`.
- `privacyRisk: "blocked"` does not create a GitHub issue draft.
- safe work creates labels `feedback`, category, priority, risk tier, `agent-ready`.
- `buildImprovementDigest` reports created, blocked, issue-created, and waiting counts.

- [ ] **Step 2: Run tests and watch them fail**

Run:

```bash
NODE_OPTIONS='--conditions=workspace' pnpm exec tsx --test scripts/src/improvement/triage.test.ts
```

Expected: fails because worker modules do not exist.

- [ ] **Step 3: Add GitHub client**

Create `scripts/src/improvement/github.ts` with:

- `GitHubIssueDraft` type.
- `GitHubIssueResult` type.
- `createGitHubIssue({ owner, repo, token, draft, dryRun })`.
- Dry-run returns `{ mode: "dry-run", url: null, number: null, draft }`.
- Live mode posts to `https://api.github.com/repos/${owner}/${repo}/issues`.
- Token comes from `GITHUB_TOKEN`, `GH_TOKEN`, or `HEYTELLI_GITHUB_TOKEN`; never from DB.

- [ ] **Step 4: Add triage worker**

Create `scripts/src/improvement/triage.ts` with:

- Pure exported helpers used by tests.
- CLI mode that loads `DATABASE_URL`, selects `improvementSignals.status = "new"`, creates or updates `improvementWorkItems`, records `improvementRuns`, and creates GitHub issues when `--live` is passed.
- Default mode is dry-run.
- Repo defaults: owner `joewilsonai`, repo `heytelli`.

- [ ] **Step 5: Add digest**

Create `scripts/src/improvement/digest.ts` with:

- `buildImprovementDigest(input)`.
- CLI mode that prints markdown summary for last 24 hours.

- [ ] **Step 6: Add package scripts and dependency**

Patch `scripts/package.json`:

```json
"improvement:triage": "tsx ./src/improvement/triage.ts",
"improvement:digest": "tsx ./src/improvement/digest.ts",
"test:improvement": "tsx --test ./src/improvement/*.test.ts"
```

Add dependencies:

```json
"@workspace/db": "workspace:*",
"@workspace/api-server": "workspace:*"
```

- [ ] **Step 7: Verify**

Run:

```bash
pnpm --filter @workspace/scripts run test:improvement
pnpm --filter @workspace/scripts run typecheck
pnpm --filter @workspace/scripts run improvement:triage -- --dry-run
```

Expected: tests and typecheck pass; dry-run exits without creating GitHub issues when no database or signals are available, with a clear error if `DATABASE_URL` is missing.

- [ ] **Step 8: Commit**

```bash
git add scripts/package.json scripts/src/improvement
git commit -m "feat: add improvement worker automation"
```

---

### Task 6: Add Mobile Feedback UX

**Files:**
- Create: `artifacts/bumble-mobile/components/FeedbackSheet.tsx`
- Create: `artifacts/bumble-mobile/lib/improvement-feedback.ts`
- Modify: `artifacts/bumble-mobile/app/settings.tsx`
- Modify: `artifacts/bumble-mobile/app/match/[id].tsx`
- Create: `artifacts/bumble-mobile/lib/improvement-feedback-ui.test.ts`

- [ ] **Step 1: Write failing mobile static tests**

Create `artifacts/bumble-mobile/lib/improvement-feedback-ui.test.ts` to assert:

- `settings.tsx` imports and renders `FeedbackSheet`.
- Settings includes visible `Send feedback`.
- Match detail includes the new feedback sheet and still supports quick beta check.
- `FeedbackSheet.tsx` includes type choices `Bug`, `Confusing`, `Idea`, `Safety concern`, `Love this`.
- `FeedbackSheet.tsx` includes technical context consent and the exact privacy reassurance: `We do not include screenshots or private conversations in engineering issues.`
- No feedback component field is named `screenshot`, `transcript`, or `rawConversation`.

- [ ] **Step 2: Run test and watch it fail**

Run:

```bash
NODE_OPTIONS='--conditions=workspace' pnpm exec tsx --test artifacts/bumble-mobile/lib/improvement-feedback-ui.test.ts
```

Expected: fails because feedback sheet files do not exist.

- [ ] **Step 3: Add submit helper**

Create `artifacts/bumble-mobile/lib/improvement-feedback.ts`:

- Export `FeedbackType`.
- Export `feedbackTypes`.
- Export `buildFeedbackTechnicalContext(surface)` returning platform/build/app route context.
- Export `submitImprovementFeedback(input)` that calls generated `createImprovementSignal`.

- [ ] **Step 4: Add feedback sheet**

Create `artifacts/bumble-mobile/components/FeedbackSheet.tsx`:

- Props: `visible`, `surface`, `matchId`, `onClose`, `onSubmitted`.
- Type segmented buttons.
- Message `TextInput`.
- Technical context `Switch` default on.
- Submit button disabled while message is empty.
- Success alert: `Thanks. Telli will use this to improve HeyTelli.`
- Privacy text: `We do not include screenshots or private conversations in engineering issues.`

- [ ] **Step 5: Add Settings entry**

Patch `artifacts/bumble-mobile/app/settings.tsx`:

- import `FeedbackSheet`.
- add `const [feedbackOpen, setFeedbackOpen] = useState(false);`
- render a `Card` above Save Settings with `Send feedback`.
- render `<FeedbackSheet visible={feedbackOpen} surface="settings" onClose={() => setFeedbackOpen(false)} />`.

- [ ] **Step 6: Convert match quick feedback**

Patch `artifacts/bumble-mobile/app/match/[id].tsx`:

- import `FeedbackSheet`.
- replace direct `createProductFeedback` in `BetaFeedbackCard` with `submitImprovementFeedback` or generated `createImprovementSignal`.
- include a "Tell us more" ghost button that opens `FeedbackSheet` with match id and surface.
- keep Yes/Maybe/No quick path with source `in_app_feedback`, type `Love this` for Yes and `Confusing` for Maybe/No, message equal to `${prompt}: ${answer}`.

- [ ] **Step 7: Verify**

Run:

```bash
NODE_OPTIONS='--conditions=workspace' pnpm exec tsx --test artifacts/bumble-mobile/lib/improvement-feedback-ui.test.ts artifacts/bumble-mobile/lib/settings-ui.test.ts
pnpm --filter @workspace/bumble-mobile run typecheck
```

Expected: mobile feedback tests and mobile typecheck pass.

- [ ] **Step 8: Commit**

```bash
git add artifacts/bumble-mobile/components/FeedbackSheet.tsx artifacts/bumble-mobile/lib/improvement-feedback.ts artifacts/bumble-mobile/lib/improvement-feedback-ui.test.ts artifacts/bumble-mobile/app/settings.tsx artifacts/bumble-mobile/app/match/[id].tsx
git commit -m "feat: add in-app improvement feedback"
```

---

### Task 7: Full Verification and Branch Finish

**Files:**
- Modify: any files needed to repair integration issues found by the checks.

- [ ] **Step 1: Run backend tests touched by this feature**

```bash
NODE_OPTIONS='--conditions=workspace' pnpm exec tsx --test \
  artifacts/api-server/src/lib/improvementPipeline.test.ts \
  artifacts/api-server/src/lib/multiTenantSchema.test.ts \
  artifacts/api-server/src/routes/improvement.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run worker tests**

```bash
pnpm --filter @workspace/scripts run test:improvement
```

Expected: all worker tests pass.

- [ ] **Step 3: Run mobile static tests touched by this feature**

```bash
NODE_OPTIONS='--conditions=workspace' pnpm exec tsx --test \
  artifacts/bumble-mobile/lib/improvement-feedback-ui.test.ts \
  artifacts/bumble-mobile/lib/settings-ui.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Run full typecheck**

```bash
pnpm run typecheck
```

Expected: full workspace typecheck passes.

- [ ] **Step 5: Run diff hygiene**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only intentional committed changes remain.

- [ ] **Step 6: Final commit if verification fixes were needed**

```bash
git add artifacts api-spec lib scripts docs
git commit -m "fix: finish autonomous feedback integration"
```

Use this commit only when Step 1-5 required integration repairs after the task commits.

---

## Execution Choice

Chosen execution path: **Subagent-Driven**. Joe asked for autonomous continuous improvement and multiple agents, so implementation will use local orchestration plus subagent review loops without making Joe the queue.
