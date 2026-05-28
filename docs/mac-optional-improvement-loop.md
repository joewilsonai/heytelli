# Mac-Optional Improvement Loop

Issue #8 makes the HeyTelli feedback-to-PR loop durable without Joe's Mac.
The Mac is a verification tool, not the control plane.

## Architecture

1. Railway API ingests feedback and system signals into private database tables.
   Raw screenshots, transcripts, match details, and tester identities stay in
   Postgres/object storage, not GitHub.
2. Railway triage, either as a cron service or one-off worker, sanitizes new
   `improvement_signals`, groups them into `improvement_work_items`, and opens
   GitHub issues only when the summary is safe.
3. GitHub labels are the public handoff. `agent-ready` means a cloud/Linux
   runner can plan work; `swarm-active` is a temporary claim; `swarm-planned`
   is the idempotent completion marker.
4. A cloud/Linux swarm runner reads `agent-ready` issues plus the private DB
   queue, comments with a checklist-only plan, updates DB run state, and leaves
   implementation/review/merge policy to the risk tier.
5. EAS cloud builds handle normal iOS beta builds and TestFlight submission.

Keep public GitHub artifacts to product surface, platform/build metadata, error
codes, safe repro notes, and agent checklists. Do not include screenshots,
transcripts, names, phone numbers, exact locations, or private dating context.

## Required Secrets

Store these in Railway, GitHub Actions, or the cloud runner secret store. Local
copies may live in `~/.luna/secrets/keys.env`, but the loop must not depend on
that file.

```bash
DATABASE_URL=<Railway Postgres URL>
HEYTELLI_GITHUB_TOKEN=<repo-scoped GitHub token>
GITHUB_OWNER=joewilsonai
GITHUB_REPO=heytelli
```

The scripts also accept `GH_TOKEN` or `GITHUB_TOKEN` instead of
`HEYTELLI_GITHUB_TOKEN`. For EAS cloud builds, configure:

```bash
EXPO_TOKEN=<Expo access token>
EXPO_PUBLIC_API_BASE_URL=https://heytelli-api-production.up.railway.app
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
IMPROVEMENT_AGENT_NAME=heytelli-triage-worker
```

Expected labels on safe actionable issues include `feedback`, category,
priority, risk tier, and `agent-ready`.

## Cloud/Linux Swarm Runner

Use this command in a clean Linux runner to verify discovery and planning
without changing GitHub or DB state:

```bash
pnpm --filter @workspace/scripts run improvement:swarm -- --dry-run --limit 5
```

Run live when the runner has `DATABASE_URL` and a GitHub token:

```bash
pnpm --filter @workspace/scripts run improvement:swarm -- --live --limit 5
```

The local wrapper is convenient for Joe's machine because it can source
`~/.luna/secrets/keys.env`, `gh auth token`, or Railway variables:

```bash
./scripts/run-improvement-swarm.sh --dry-run
./scripts/run-improvement-swarm.sh --limit 5
```

Cloud runners should prefer explicit environment secrets over the local wrapper.
The runner comments with deterministic markers, so retries should not duplicate
plan comments.

## EAS Cloud Builds

Normal beta builds do not need a Mac:

```bash
cd artifacts/bumble-mobile
pnpm dlx eas-cli@latest build -p ios --profile beta --non-interactive
pnpm dlx eas-cli@latest submit -p ios --profile beta --latest --non-interactive
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

Everything else should run from Railway, GitHub, EAS, or a Linux runner.
