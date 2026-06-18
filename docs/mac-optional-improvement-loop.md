# Mac-First Improvement Loop

HeyTelli defaults to Joe's Mac as the swarm host so Codex, GitHub auth,
Railway auth, Xcode, EAS, PyPhone, and local logs stay in one trusted place.
GitHub Actions remains a manual fallback, not the primary scheduled runner.

## Architecture

For the full agent/process map, data flow, labels, risk tiers, and current V1
limits, see [`docs/swarm-agents.md`](./swarm-agents.md).

1. Railway API ingests feedback and system signals into private database tables.
   Raw screenshots, transcripts, match details, and tester identities stay in
   Postgres/object storage, not GitHub.
2. Railway triage, either as a cron service or one-off worker, sanitizes new
   `improvement_signals`, groups them into `improvement_work_items`, and opens
   GitHub issues only when the summary is safe.
3. GitHub labels are the repo-visible handoff. `agent-ready` means a trusted
   runner can plan work; `needs-breakdown`, `scope:large`, `multi-pr`, or
   `multi-pr-needed` tells the runner to split a broad parent into child
   issues before implementation; `swarm-active` is a temporary claim;
   `swarm-planned` is the idempotent planning marker.
4. Joe's Mac is the default trusted runner. It checks Tailscale and power
   readiness, reads `agent-ready` issues plus the private DB queue, comments
   with a checklist-only plan, executes planned low/medium-risk work in local
   git worktrees, opens PRs, and queues auto-merge only when the risk tier
   allows it. It also runs reconciliation before and after the swarm loop so
   generated worktrees, local swarm branches, stale labels, and PR/DB drift are
   cleaned up by the system.
5. EAS cloud builds handle normal iOS beta builds and TestFlight submission.

Keep GitHub-visible artifacts to product surface, platform/build metadata,
error codes, safe repro notes, and agent checklists. The repository is private,
but GitHub issues, PRs, prompts, CI logs, and integrations are still not the
right place for screenshots, transcripts, names, phone numbers, exact
locations, or private dating context.

## Required Secrets

Store these in Railway, GitHub Actions, or the trusted runner secret store.
Joe's Mac uses `~/.luna/secrets/keys.env` plus `gh auth token` and Railway CLI
fallbacks.

```bash
DATABASE_URL=<public-reachable Railway Postgres URL>
HEYTELLI_GITHUB_TOKEN=<repo-scoped GitHub token>
GITHUB_OWNER=joewilsonai
GITHUB_REPO=heytelli
```

GitHub-hosted runners cannot reach Railway private-network URLs. Use the
public Postgres connection string for `DATABASE_URL` or `HEYTELLI_DATABASE_URL`
in GitHub Actions.

The scripts also accept `GH_TOKEN` or `GITHUB_TOKEN` instead of
`HEYTELLI_GITHUB_TOKEN`. For EAS cloud builds, configure:

```bash
EXPO_TOKEN=<Expo access token>
EXPO_PUBLIC_API_BASE_URL=https://heytelli-api-production.up.railway.app
```

For automated TestFlight processing checks, configure an App Store Connect API
key in the trusted runner secret store:

```bash
APP_STORE_CONNECT_ISSUER_ID=<issuer id>
APP_STORE_CONNECT_KEY_ID=<key id>
APP_STORE_CONNECT_PRIVATE_KEY=<p8 private key>
HEYTELLI_APP_STORE_APP_ID=6773488324
```

Optional deployment/agent jobs may also need `RAILWAY_TOKEN` for Railway CLI
deploys or log checks and model/API credentials for the agent runtime. Keep
those in the runner secret store, not in repo docs or GitHub issue bodies.

Apple/App Store Connect credentials should be managed by EAS credentials for
the `ai.joewilson.heytelli` app and share extension. Do not put Apple passwords
or private tester data into GitHub issues or runner logs.

## Railway Triage

Dry-run is safe in CI/Linux and should be the first check:

```bash
pnpm --filter @workspace/scripts run improvement:triage -- --dry-run
```

Live triage updates private DB state. To also open sanitized GitHub issues,
enable issue creation explicitly:

```bash
IMPROVEMENT_CREATE_GITHUB_ISSUES=true \
pnpm --filter @workspace/scripts run improvement:triage -- --live
```

Useful knobs:

```bash
IMPROVEMENT_TRIAGE_LIMIT=25
IMPROVEMENT_MAX_GITHUB_ISSUES_PER_RUN=5
IMPROVEMENT_AGENT_NAME=heytelli-triage-worker
```

Expected labels on safe actionable issues include `feedback`, category,
priority, risk tier, and `agent-ready`.

## Local Mac Swarm Host

The Mac host preflight checks Tailscale status, reachable MagicDNS/IP, relay,
and `pmset` sleep/keepalive settings without printing peer devices or private
tailnet details:

```bash
pnpm --filter @workspace/scripts run local-swarm-host:check
```

Run a safe local discovery pass:

```bash
./scripts/run-local-swarm-host.sh --dry-run --limit 5
```

Run the live local swarm planner, executor, lifecycle monitor, and beta monitor:

```bash
./scripts/run-local-swarm-host.sh --live --limit 5
```

The wrapper runs six steps in order:

1. `improvement:reconcile` sweeps generated worktrees, local swarm branches,
   stale swarm labels, and PR/DB drift before new planning starts.
2. `run-improvement-swarm.sh` turns safe `agent-ready` issues into private DB
   work items with `planned` status. If a parent issue is too broad, the runner
   creates PR-sized child work items and child GitHub issues, comments back on
   the parent, removes `agent-ready` from the parent, and lets the child issues
   continue through the normal swarm flow.
3. `run-swarm-executor.sh` claims `planned` work, creates an isolated worktree,
   installs dependencies in that worktree, asks the local agent to implement
   from sanitized context, and typechecks. If the agent proves the request is
   already implemented and leaves the worktree unchanged, the executor comments
   on the issue, closes it as completed, and marks the DB work item `closed`
   without a PR. Otherwise it opens a PR, comments back on the source issue,
   and queues auto-merge for `safe_auto_merge` work.
4. `improvement:lifecycle` checks PR-linked work items and moves them to
   `merged`, `closed`, or their current review/check state.
5. `improvement:reconcile` runs again after lifecycle monitoring to clean up
   terminal generated work and repair any newly visible drift.
6. `ios-beta:monitor` checks App Store Connect processing state when API
   credentials are configured. If credentials are missing, it reports
   `not_configured` and does not block the swarm.

You can exercise the executor by itself:

```bash
./scripts/run-swarm-executor.sh --dry-run --limit 5
./scripts/run-swarm-executor.sh --live --limit 1
```

The executor digest includes `Resolved without PR`. That count should rise
when beta feedback asks for behavior already present in the current app. A
nonzero `Failed` count means the local log and `/admin/improvement/health`
should be checked before assuming the feedback is still waiting on agents.

By default the executor uses:

```bash
codex exec --dangerously-bypass-approvals-and-sandbox --cd <worktree> -
```

To swap in a different local agent command, set
`HEYTELLI_SWARM_EXECUTOR_COMMAND`. The command receives:

```bash
HEYTELLI_SWARM_PROMPT_FILE=<path to sanitized prompt>
HEYTELLI_SWARM_WORKTREE=<path to isolated worktree>
```

To run real reviewer lanes, set `HEYTELLI_SWARM_REVIEWER_COMMAND`. The executor
calls it once per required reviewer role after the PR is opened. The command
receives a sanitized review prompt on stdin and:

```bash
HEYTELLI_SWARM_REVIEW_ROLE=<role>
HEYTELLI_SWARM_REVIEW_PROMPT=<sanitized review prompt>
HEYTELLI_SWARM_PR_URL=<opened PR URL>
HEYTELLI_SWARM_WORKTREE=<path to isolated worktree>
```

For Joe's local Mac host, use the repo wrapper:

```bash
HEYTELLI_SWARM_REVIEWER_COMMAND=./scripts/run-swarm-reviewer.sh
IMPROVEMENT_EXECUTOR_ALLOW_GUARDED_AUTO_MERGE=true
```

The wrapper runs Codex in read-only review mode, asks for structured JSON, and
returns a failing exit code when a reviewer marks the PR as blocking.

Reviewer commands run sequentially by default. Use
`IMPROVEMENT_REVIEWER_PARALLELISM=2` or `--reviewer-parallelism 2` only after
the reviewer command is stable enough for bounded parallel review.

Custom executor and reviewer commands are checked against the local denylist in
`scripts/src/improvement/hooks.ts` before they run. The executor also records
structured trace spans in `improvement_trace_spans`.

`guarded_auto_merge` and `extra_agent_review` work items can still open PRs, but
they do not queue auto-merge unless the corresponding executor flags are
enabled and reviewer agents are configured. `no_auto_merge` items remain
research/planning-only in the V1 runner.

Install the Mac as the default scheduled swarm host:

```bash
./scripts/install-local-swarm-launchd.sh
```

The launchd job runs every 15 minutes by default, uses `caffeinate` while the
swarm is active, and writes logs to:

```bash
~/Library/Logs/heytelli/local-swarm.out.log
~/Library/Logs/heytelli/local-swarm.err.log
```

Useful knobs:

```bash
HEYTELLI_LOCAL_SWARM_INTERVAL_SECONDS=900
HEYTELLI_LOCAL_SWARM_LIMIT=5
```

Uninstall the Mac runner:

```bash
./scripts/uninstall-local-swarm-launchd.sh
```

The current Mac should stay reachable over Tailscale. Keep the exact MagicDNS
name and tailnet IP in the private runner setup notes or secret store, not in
repo documentation. From another trusted tailnet machine, connect with:

```bash
tailscale ssh <user>@<mac-magicdns-name>
```

## Cloud/Linux Swarm Fallback

Use this command in a clean Linux runner to verify discovery and planning
without changing GitHub or DB state:

```bash
pnpm --filter @workspace/scripts run improvement:swarm -- --dry-run --limit 5
```

Dry-run still needs `DATABASE_URL` because the runner joins public
`agent-ready` issues back to the private work-item queue before deciding what
is actionable.

Run live when the runner has `DATABASE_URL` and a GitHub token:

```bash
pnpm --filter @workspace/scripts run improvement:swarm -- --live --limit 5
```

The local wrapper is convenient for Joe's machine because it can source
`~/.luna/secrets/keys.env`, `gh auth token`, or Railway variables:

```bash
./scripts/run-improvement-swarm.sh --dry-run
./scripts/run-improvement-swarm.sh --limit 5
./scripts/run-improvement-swarm.sh --live --limit 5
```

The GitHub Actions workflow is manual-only now and plans work only. Use it when
the Mac is unavailable or when you want a cloud dry-run. Cloud runners should
prefer explicit environment secrets over the local wrapper. The runner comments
with deterministic markers, so retries should not duplicate plan comments.

## EAS Cloud Builds

Normal beta builds do not need a Mac. The mobile package still lives at
`artifacts/bumble-mobile` while the Expo scaffold is becoming HeyTelli:

The GitHub Actions workflow `.github/workflows/ios-beta-build.yml` starts an
EAS iOS beta build automatically on `main` pushes that touch mobile or shared
client files. Push-triggered builds auto-submit the completed beta build to
TestFlight by default, keeping the autonomous improvement loop responsible for
getting merged mobile changes onto tester devices. Run the workflow manually
with `submit=false` only for deliberate smoke builds that should not reach
TestFlight. Without `EXPO_TOKEN`, the workflow logs a notice and skips the EAS
build instead of failing unrelated merges.

The workflow also runs an early scope check. Web-only, docs-only, landing-only,
or root-package-only pushes skip before dependency install and before EAS, so
they do not queue a stale iOS build. Manual dispatch still bypasses this scope
skip.

```bash
cd artifacts/bumble-mobile
pnpm dlx eas-cli@latest build -p ios --profile beta --non-interactive
pnpm dlx eas-cli@latest submit -p ios --profile beta --latest --non-interactive
```

Run those commands from the mobile app directory. Avoid using `pnpm --dir
artifacts/bumble-mobile dlx eas-cli ...` for submit from the repo root; that
can make EAS resolve the root workspace package instead of the HeyTelli mobile
app and prompt to create the wrong EAS project.

After EAS prints that the app was submitted, Apple still has to process the
binary before it appears as available in TestFlight. Check:

```text
https://appstoreconnect.apple.com/apps/6773488324/testflight/ios
```

Or use the App Store Connect API monitor:

```bash
pnpm --filter @workspace/scripts run ios-beta:monitor
```

The monitor reports `not_configured`, `waiting`, `processing`, `available`,
`failed`, `expired`, or `unknown`. A successful EAS submit is not considered
done for testers until this monitor or App Store Connect shows the build is
available.

Run the improvement eval harness when changing sanitization, triage, labels, or
risk policy:

```bash
pnpm --filter @workspace/scripts run improvement:evals
```

Development-client builds are also cloud-built:

```bash
cd artifacts/bumble-mobile
pnpm dlx eas-cli@latest build -p ios --profile development --non-interactive
```

Mobile rollback currently means shipping another TestFlight build. EAS Update is
not part of the V1 loop.

## When A Mac Is Still Needed

Use Joe's Mac, PyPhone, Xcode, or local native tools for:

- Verifying `Share to HeyTelli` on a physical iPhone.
- Installing and launching a development client on PyPhone.
- Xcode signing, entitlements, app group, or share-extension debugging.
- Native crash/device log investigation.
- Manual App Store Connect checks when EAS cannot complete a credential flow.

Everything else can run from Railway, GitHub, EAS, or a Linux runner when the
Mac is unavailable.
