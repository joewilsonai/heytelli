# HeyTelli Swarm Agents

This document maps the autonomous HeyTelli improvement loop: what each runner
does, where the code lives, where work is stored, and what the V1 "agents" are.

## Short Version

The swarm is a privacy-gated automation pipeline, not a support queue. The repo
is private, but private product signals still stay in the database. Only
sanitized summaries become GitHub issues because issues, PRs, prompts, CI logs,
and integrations are broader surfaces than the private app database. Joe's Mac
is the trusted host that plans and executes work from those sanitized issues.

In V1, the system has two meanings of "agent":

- Runner agents are real processes: triage, planner, executor, and the local
  Codex implementation process launched by the executor.
- Swarm roles are planning metadata: researcher, builder, product reviewer,
  privacy reviewer, safety reviewer, backend/API reviewer, code reviewer, and
  test reviewer. They define required review lanes and checks. The executor can
  now run those reviewer lanes as real local reviewer commands when
  `HEYTELLI_SWARM_REVIEWER_COMMAND` is configured.

## Where The Swarm Lives

| Layer | Location | Purpose |
| --- | --- | --- |
| In-app feedback helper | `artifacts/bumble-mobile/lib/improvement-feedback.ts` | Sends privacy-safe beta feedback to the API. |
| API route | `artifacts/api-server/src/routes/improvement.ts` | Receives `/improvement/signals`, validates auth, stores private signal rows, exposes `/improvement/signals/mine`, and exposes admin reads/health. |
| Sanitizer/classifier | `artifacts/api-server/src/lib/improvementPipeline.ts` | Normalizes feedback, removes private data, assigns category, priority, and risk tier, and creates safe GitHub issue drafts. |
| Feedback status/health/control room | `artifacts/api-server/src/lib/improvementStatus.ts` | Maps private signals/work items/runs into user-safe follow-up timelines, admin health snapshots, and the demo-safe control room. |
| DB schema | `lib/db/src/schema/improvementPipeline.ts` | Defines `improvement_signals`, `improvement_work_items`, and `improvement_runs`. |
| Triage worker | `scripts/src/improvement/triage.ts` | Groups new signals into private work items and optionally opens sanitized GitHub issues. |
| GitHub adapter | `scripts/src/improvement/github.ts` | Lists issues, creates issues, labels issues, removes labels, comments with deterministic markers, and closes resolved issues. |
| Planner | `scripts/src/improvement/swarm.ts` | Turns `agent-ready` issues into DB-backed swarm plans, child issues, or recovery issues. |
| Role/risk policy | `scripts/src/improvement/swarmPlan.ts` | Maps labels, privacy risk, priority, and category to required roles, checks, and auto-merge policy. |
| Executor | `scripts/src/improvement/executor.ts` | Claims planned work, creates a worktree, launches Codex, resolves already-shipped requests without PRs, runs optional reviewer agents, typechecks, commits, pushes, opens PRs, and queues auto-merge when allowed. |
| Trace spans | `lib/db/src/schema/improvementPipeline.ts`, `scripts/src/improvement/trace.ts` | Stores structured per-step spans for executor tool, agent, check, GitHub, and release activity. |
| Feature cost ledger | `scripts/src/improvement/featureCost.ts`, `artifacts/api-server/src/lib/improvementStatus.ts` | Estimates model-dollar cost before implementation, records actual agent token/effort cost after execution, and exposes cost summaries in the admin control room. |
| Agent profiles | `scripts/src/improvement/agentProfiles.ts`, `docs/agents/` | Defines repo-local specialist expectations for API, Expo, web parity, privacy, and release work. |
| Hook gates | `scripts/src/improvement/hooks.ts` | Blocks dangerous custom commands and defines deterministic pre/post executor checks. |
| Eval harness | `scripts/src/improvement/evals.ts` | Runs historical feedback category/risk/outcome evals against the improvement pipeline. |
| Lifecycle monitor | `scripts/src/improvement/lifecycle.ts` | Watches PR-linked work items and moves them to `merged`, `closed`, or ongoing review/check states. |
| Reconciler | `scripts/src/improvement/reconcile.ts` | Sweeps generated worktrees, local swarm branches, stale labels, and PR/DB state drift so cleanup is system-owned. |
| Demo seed | `scripts/src/improvement/demoSeed.ts` | Creates privacy-safe synthetic feedback scenarios for replaying the feedback-to-feature loop in demos. |
| TestFlight monitor | `scripts/src/iosBetaMonitor.ts` | Checks App Store Connect build processing state when ASC API credentials are configured. |
| Local host wrapper | `scripts/run-local-swarm-host.sh` | Sources secrets, checks Mac readiness, runs planner, executor, lifecycle monitor, and beta monitor under `caffeinate`. |
| Planner wrapper | `scripts/run-improvement-swarm.sh` | Sources secrets and runs `improvement:swarm`. |
| Executor wrapper | `scripts/run-swarm-executor.sh` | Sources secrets and runs `improvement:execute`. |
| Scheduled Mac job | `scripts/install-local-swarm-launchd.sh` | Installs launchd job `ai.heytelli.local-swarm`. |
| Cloud fallback | `.github/workflows/improvement-swarm.yml` | Manual planner-only fallback when the Mac is unavailable. |
| Mobile beta release | `.github/workflows/ios-beta-build.yml` | Builds iOS on mobile/shared changes and submits push builds to TestFlight by default. |

## Data Flow

1. A tester or system submits a signal to `/improvement/signals`.
2. The API validates the user, strips unsafe context, stores raw private data in
   `improvement_signals`, and stores sanitized summary/payload fields.
3. Triage reads `new` signals, fingerprints and groups duplicates, creates or
   updates `improvement_work_items`, and marks signals `triaged` or `blocked`.
4. If GitHub issue creation is enabled, the work item is safe enough, and the
   per-run issue cap has room, triage opens a sanitized issue with labels like
   `agent-ready`, `priority:p2`, and `risk:guarded_auto_merge`.
5. The planner reads open GitHub issues with `agent-ready`, joins them back to
   private work items, and either:
   - writes a swarm plan and moves the work item to `planned`;
   - breaks broad work into PR-sized child issues; or
   - creates a recovery issue for blocked swarm work.
6. The executor reads `planned` work items, verifies the source issue is still
   open and not blocked, creates an isolated worktree, writes a sanitized prompt,
   runs Codex, runs typecheck, and either:
   - comments and closes the issue if Codex proves the request is already
     implemented and the worktree is unchanged; or
   - commits, pushes, opens a PR, and updates the DB.
7. If `HEYTELLI_SWARM_REVIEWER_COMMAND` is configured, the executor runs the
   required reviewer roles as separate local review commands against the
   worktree/PR context.
8. The executor records a `featureCostEstimate` when implementation starts and a
   `featureCostActual` when it succeeds or fails. Actuals use observed Codex
   token totals when present, plus reviewer counts and execution duration.
9. If the risk tier allows it, the executor queues GitHub auto-merge after PR
   checks and required reviewer agents. Otherwise it leaves the PR review-gated.
10. The lifecycle monitor follows PR-linked work items after execution and moves
   DB state forward when PRs merge or close.
11. The reconciler runs before and after the local swarm loop to remove stale
   generated worktrees/branches, clean stale labels, and repair PR/DB drift.
12. Mobile changes merged to `main` trigger the iOS beta workflow. Push builds
   submit to TestFlight by default.

## Mobile-Web Fidelity Rule

For any issue or PR that changes a user-facing mobile workflow, setting, color
theme, copy string, navigation concept, or API-backed behavior, the planner and
implementation agent must check `artifacts/heytelli-web` too.

If the browser can support the same behavior, update the web app in the same PR.
If parity is not feasible, state the reason in the PR body or swarm completion
comment. Native-only iOS flows such as share extensions, TestFlight delivery,
and native share-sheet artifacts can remain mobile-only, but that decision
should be explicit.

The default prompt section now includes this rule even when no specialist
profile is selected. The `expo_mobile` profile also brings in the `web_app`
profile so mobile work gets the web test/typecheck/build expectations when
feasible.

## What Happens When A User Sends Feedback

The app can send feedback through `artifacts/bumble-mobile/lib/improvement-feedback.ts`
to the API route `/improvement/signals`.

That always starts as a private database signal, not as a GitHub issue. The
signal becomes swarm work only when all of these are true:

- the API accepts and stores the signal in `improvement_signals`;
- the signal is not blocked by the sanitizer;
- the triage worker runs live;
- `IMPROVEMENT_CREATE_GITHUB_ISSUES=true` is enabled for that triage run;
- the per-run GitHub issue cap has not been exhausted;
- the generated work item is safe enough to create a private-repo GitHub issue;
- the issue has `agent-ready` and a `risk:*` label;
- the local Mac swarm host or cloud planner runs live and sees that issue;
- the executor runs live and the work item is executable for its risk tier.

Blocked/high-privacy signals stay in the private database and do not become
GitHub issues. Broad issues may become child issues before implementation.
`no_auto_merge` work can be planned but is not implemented/merged by the V1
executor.

The app can read `/improvement/signals/mine` to show a user-safe follow-up
status and timeline: received, accepted, planned, shipped, already available,
not planned, or blocked. Timeline events are derived from sanitized signal
state, grouped work item state, and improvement runs. That route does not return
raw payloads, GitHub issue URLs, PR URLs, or private database context.

Admins can read `/admin/improvement/health` for queue counts and recent run
state, or `/admin/improvement/control-room` for the demo-safe control room:
agent lanes, recent work, recent runs, reconsider candidates, and the short demo
script.

## Work Storage

`improvement_signals` stores the incoming signal, including private raw payload
that must not be copied into GitHub.

`improvement_work_items` stores the canonical unit of work. Important fields:

- `status`: `draft`, `issue_created`, `researching`, `planned`, `building`,
  `reviewing`, `changes_requested`, `checks_running`, `merged`, `deployed`,
  `monitoring`, `rolled_back`, or `closed`.
- `decisionCategory` and `decisionDetails`: why closed work was shipped,
  already available, not planned, not reproducible, blocked by privacy/safety,
  out of scope, duplicate, or superseded.
- `decisionReconsiderAfterCount`: how many grouped requests should make a
  closed/not-planned decision show up as a reconsideration candidate.
- `githubIssueNumber` and `githubIssueUrl`: repo-visible sanitized handoff.
- `branchName`, `pullRequestUrl`, and `pullRequestNumber`: executor output.
- `riskTier`: controls whether work can auto-merge.
- `signalIds` and `frequencyCount`: dedupe/frequency tracking.

Closed work is not thrown away. If beta users keep sending the same request,
triage continues to merge their signal IDs into the existing work item and
increase `frequencyCount`. Admin health exposes `reconsiderCandidates` when a
not-planned decision reaches its reconsider threshold, so agents can use real
demand to decide whether to reopen or re-scope the idea.

New feedback fingerprints use a deterministic local semantic cluster key before
hashing. Common phrasing variants such as "more color themes", "change app
color", and "less pink" group into the same demand cluster without requiring a
model call in the submission path.

Reconsider thresholds are category-aware. `needs_more_signal`, `not_planned`,
and `not_reproducible` reopen at lower demand; `out_of_scope` needs stronger
demand; `privacy_or_safety` does not auto-reopen without explicit review.

`improvement_runs` stores the audit trail for triage, research/planning,
implementation, review, merge, deploy, monitor, and rollback events.

Implementation runs can include `featureCostEstimate` and `featureCostActual`
metadata. These summaries contain model name, estimated/actual dollars, token
counts, confidence, cost per requesting user, reviewer counts, duration, and
retry/release counters. They do not store raw prompts, raw agent output, private
feedback, screenshots, transcripts, or credentials.

## Labels And Gates

The GitHub issue is only a sanitized pointer inside the private repo. Labels
drive the runner:

- `agent-ready`: planner may inspect and claim the issue.
- `risk:safe_auto_merge`: low-risk work can auto-merge after standard checks.
- `risk:guarded_auto_merge`: PR can be opened; auto-merge requires explicit
  executor opt-in.
- `risk:extra_agent_review`: PR can be opened; auto-merge requires explicit
  executor opt-in and stronger review expectations.
- `risk:no_auto_merge`: research/planning only in V1.
- `priority:p0` through `priority:p3`: urgency and risk escalation input.
- `needs-breakdown`, `scope:large`, `multi-pr`, `multi-pr-needed`: planner
  should create child issues instead of executing the parent directly.
- `swarm-active`: temporary planner claim.
- `swarm-planned`: planner has produced the repo-visible plan and DB work is ready.
- `swarm-blocked`: executor/planner must not proceed; recovery planning may
  create a safer child lane.
- `swarm-done`, `wontfix`, `contains-private-context`, `needs-more-signal`:
  block normal planning/execution.

## Risk Tiers And Agent Roles

The policy lives in `scripts/src/improvement/swarmPlan.ts`.

`safe_auto_merge`:

- Roles: researcher, builder, code reviewer.
- Checks: focused tests, code review.
- Auto-merge policy: after checks.

`guarded_auto_merge`:

- Roles: researcher, builder, product reviewer, privacy reviewer, code reviewer.
- Checks: product review, privacy review, code/test review, smoke test plan.
- Auto-merge policy: review-gated unless the executor is explicitly allowed to
  auto-merge guarded work and reviewer agents are configured.

`extra_agent_review`:

- Roles: researcher, builder, privacy reviewer, safety reviewer, backend/API
  reviewer, code reviewer, test reviewer.
- Checks: privacy review, safety review, backend/API review when applicable,
  code review, test review, rollback plan.
- Auto-merge policy: review-gated unless the executor is explicitly allowed to
  auto-merge extra-review work and reviewer agents are configured.

`no_auto_merge`:

- Roles: researcher, product reviewer.
- Checks: research summary, implementation plan.
- Auto-merge policy: never auto-merge in V1.

Safety/privacy-sensitive work is deliberately escalated. `p0`, blocked privacy
risk, high-risk privacy work, and safety issues cannot silently flow through
the safe lane.

## What The Executor Actually Does

The executor is the piece that launches a real implementation agent. Its normal
command path is:

```bash
git fetch origin main
git worktree add -B <branch> <repo>/.worktrees/swarm-executor/<workItemId> origin/main
pnpm install --frozen-lockfile
codex exec --dangerously-bypass-approvals-and-sandbox --cd <worktree> -
pnpm run typecheck
git add -A
git commit -m "fix: <work item slug>"
git push -u origin <branch>
gh pr create --base main --head <branch>
gh pr merge --squash --auto --delete-branch # only when the plan allows it
```

The executor writes the sanitized prompt to:

```bash
.worktrees/swarm-executor/<workItemId>/.heytelli-swarm-prompt.md
```

That scratch prompt is removed before commit staging. The prompt tells the
implementation agent to stay inside the worktree, avoid infrastructure commands,
write focused tests, and avoid private screenshots, transcripts, names, phone
numbers, exact addresses, or private dating details.

The prompt includes repo-local specialist profiles selected from the work item.
Profile docs live in:

```text
docs/agents/api-server.md
docs/agents/expo-mobile.md
docs/agents/web-app.md
docs/agents/privacy-review.md
docs/agents/release-verification.md
```

If the agent responds with `RESOLVED_BY_EXISTING_IMPLEMENTATION: <reason>` and
leaves no repository changes, the executor treats the work as successful:
it posts an idempotent `heytelli-swarm-resolved-without-pr` issue comment,
closes the source issue as completed, removes active/planned handoff labels,
moves the work item to `closed`, and cleans up the local worktree/branch. If
the agent claims that marker while leaving code changes, the executor blocks
instead of committing contradictory output.

The executor records structured trace spans in `improvement_trace_spans` for
major tool, agent, check, GitHub, and cleanup steps. Trace metadata is
recursively redacted for tokens, secrets, credentials, private keys, cookies,
passwords, and authorization values.

Set `HEYTELLI_SWARM_EXECUTOR_COMMAND` to replace the default Codex command. The
custom command receives:

```bash
HEYTELLI_SWARM_PROMPT_FILE=<path to sanitized prompt>
HEYTELLI_SWARM_WORKTREE=<path to isolated worktree>
```

Set `HEYTELLI_SWARM_REVIEWER_COMMAND` to run real reviewer agents after the PR
is opened and before any guarded/extra auto-merge can be queued. The command is
called once per required reviewer role and receives the review prompt on stdin,
plus:

```bash
HEYTELLI_SWARM_REVIEW_ROLE=<role>
HEYTELLI_SWARM_REVIEW_PROMPT=<sanitized review prompt>
HEYTELLI_SWARM_PR_URL=<opened PR URL>
HEYTELLI_SWARM_WORKTREE=<path to isolated worktree>
```

The repo includes a default local reviewer wrapper:

```bash
HEYTELLI_SWARM_REVIEWER_COMMAND=./scripts/run-swarm-reviewer.sh
IMPROVEMENT_EXECUTOR_ALLOW_GUARDED_AUTO_MERGE=true
```

`scripts/run-swarm-reviewer.sh` invokes `codex exec` in read-only sandbox mode,
requires structured JSON back from each reviewer role, and exits nonzero when a
reviewer reports a blocking issue. That lets guarded work queue auto-merge only
after the implementation agent, typecheck, GitHub checks, and reviewer roles
all pass.

Reviewer agents must not edit, commit, push, merge, or change labels. A failing
review command blocks the executor and moves the work item to the failure path.
`guarded_auto_merge` and `extra_agent_review` require both explicit executor
auto-merge flags and configured reviewer agents before auto-merge is queued.
Reviewer commands run sequentially by default. Set
`IMPROVEMENT_REVIEWER_PARALLELISM=2` or pass `--reviewer-parallelism 2` to run
bounded parallel review batches after the reviewer command is stable.

Custom executor and reviewer commands are checked against a deterministic
denylist before they run. The current denylist blocks dangerous patterns such as
`git reset --hard`, `git checkout --`, root `rm -rf`, direct `psql`,
destructive Railway commands, and repo deletion.

The lifecycle monitor is separate from the executor:

```bash
pnpm --filter @workspace/scripts run improvement:lifecycle -- --dry-run
pnpm --filter @workspace/scripts run improvement:lifecycle -- --live
```

It reads PR-linked `reviewing`, `checks_running`, and `monitoring` work items,
checks GitHub PR state, and updates the private DB to `merged` or `closed` when
the PR state changes.

## Mac Host

The preferred live host is Joe's Mac because it already has repo access, `gh`,
Railway, EAS, local logs, and Tailscale. The scheduled job is:

```bash
ai.heytelli.local-swarm
```

Install it with:

```bash
./scripts/install-local-swarm-launchd.sh
```

It runs every 15 minutes by default:

```bash
HEYTELLI_LOCAL_SWARM_INTERVAL_SECONDS=900
HEYTELLI_LOCAL_SWARM_LIMIT=5
```

Logs live at:

```bash
~/Library/Logs/heytelli/local-swarm.out.log
~/Library/Logs/heytelli/local-swarm.err.log
```

Run it directly:

```bash
./scripts/run-local-swarm-host.sh --dry-run --limit 5
./scripts/run-local-swarm-host.sh --live --limit 5
```

The wrapper sources `~/.luna/secrets/keys.env`, verifies local host readiness,
and runs planner, executor, lifecycle monitoring, and the iOS beta monitor.
Without an explicit mode flag it defaults to `--dry-run`.

## Useful Commands

Manual TestFlight submit for the latest EAS iOS build:

```bash
cd artifacts/bumble-mobile
pnpm dlx eas-cli@latest submit -p ios --profile beta --latest --non-interactive
```

Do not run this as `pnpm --dir artifacts/bumble-mobile dlx eas-cli ...` from
the repo root. That path has been observed to make EAS inspect the root
workspace package and prompt to create `@thenelseif/workspace`, which is the
wrong project. `cd` into `artifacts/bumble-mobile` first so EAS reads the
HeyTelli `app.json` and `eas.json`.

When EAS reports a successful submit, the binary has been uploaded to App Store
Connect and Apple processing begins. Confirm installability in TestFlight after
processing finishes:

```text
https://appstoreconnect.apple.com/apps/6773488324/testflight/ios
```

Triage:

```bash
pnpm --filter @workspace/scripts run improvement:triage -- --dry-run
IMPROVEMENT_CREATE_GITHUB_ISSUES=true pnpm --filter @workspace/scripts run improvement:triage -- --live
```

The triage worker defaults to at most five new GitHub issues per run. Tune this
if a noisy client release starts flooding feedback:

```bash
IMPROVEMENT_MAX_GITHUB_ISSUES_PER_RUN=5
pnpm --filter @workspace/scripts run improvement:triage -- --live
```

Planner:

```bash
./scripts/run-improvement-swarm.sh --dry-run --limit 5
./scripts/run-improvement-swarm.sh --live --limit 5
```

Executor:

```bash
./scripts/run-swarm-executor.sh --dry-run --limit 5
./scripts/run-swarm-executor.sh --live --limit 1
```

Lifecycle monitor:

```bash
pnpm --filter @workspace/scripts run improvement:lifecycle -- --dry-run
pnpm --filter @workspace/scripts run improvement:lifecycle -- --live
```

iOS beta/TestFlight monitor:

```bash
pnpm --filter @workspace/scripts run ios-beta:monitor
```

The beta monitor uses App Store Connect API credentials when available:

```bash
APP_STORE_CONNECT_ISSUER_ID=<issuer id>
APP_STORE_CONNECT_KEY_ID=<key id>
APP_STORE_CONNECT_PRIVATE_KEY=<p8 private key>
HEYTELLI_APP_STORE_APP_ID=6773488324
```

Improvement evals:

```bash
pnpm --filter @workspace/scripts run improvement:evals
```

The evals cover historical feedback patterns for expected category, risk tier,
and whether a GitHub-visible issue should be opened or blocked.

Local host:

```bash
pnpm --filter @workspace/scripts run local-swarm-host:check
./scripts/run-local-swarm-host.sh --live --limit 5
```

Tests:

```bash
pnpm --filter @workspace/scripts run test:improvement
pnpm --filter @workspace/scripts run test:local-swarm-host
pnpm --filter @workspace/scripts run test:ci-workflows
```

## Autonomy Boundaries

The swarm should handle routine product fixes end to end: ingest, sanitize,
issue, plan, implement, test, PR, auto-merge when safe, build, and TestFlight
submission for mobile changes.

It should not autonomously publish private data, create public match pages,
weaken privacy or safety controls, invent missing user context, expose secrets,
or auto-merge `no_auto_merge` work.

Real external blockers still require operator intervention: missing/revoked
tokens, Apple credential prompts that EAS cannot handle, unavailable GitHub or
Railway services, or a safety/privacy decision that cannot be resolved from
sanitized context.

## Comparison To Common Agent Patterns

The current design intentionally follows the strongest common pattern from
production agent systems: a central orchestrator owns state and risk decisions,
while specialist agents are invoked only when the task benefits from them. That
maps well to the planner/executor split here.

HeyTelli already has several important best-practice pieces:

- DB-backed state for resumability instead of relying on a chat transcript.
- Small PR-sized issue breakdown before implementation.
- Separate implementation and review lanes.
- Deterministic labels, status fields, run rows, and comment markers.
- Privacy/risk gates before GitHub-visible handoff.
- Isolated worktrees and branch/PR output instead of direct main writes.
- Bounded issue creation and executor limits.
- Post-merge and TestFlight monitoring hooks.

The main gaps to consider next:

- A larger eval set with real issue-to-PR outcomes once more autonomous work has
  landed.
- Trace visualization in the admin dashboard instead of raw DB/API inspection.
- Optional MCP/tool-level enforcement around shell commands, not just
  pre-validating custom command strings.

## Current V1 Limitations

- Reviewer roles are real only when `HEYTELLI_SWARM_REVIEWER_COMMAND` is set.
  Without it, the role list remains policy metadata and PRs stay review-gated
  for guarded/extra work.
- `guarded_auto_merge` and `extra_agent_review` can open PRs, but auto-merge is
  disabled unless executor flags explicitly allow it and reviewer agents are
  configured.
- `no_auto_merge` is planning/research only.
- Mobile rollback still requires another TestFlight build because EAS Update is
  not part of the V1 loop.
- Cloud GitHub Actions are fallback/planner-only for the swarm. The Mac remains
  the trusted implementation host.
