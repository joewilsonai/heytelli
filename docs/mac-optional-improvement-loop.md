# Mac-First Improvement Loop

HeyTelli defaults to Joe's Mac as the swarm host so Codex, GitHub auth,
Railway auth, Xcode, EAS, PyPhone, and local logs stay in one trusted place.
GitHub Actions remains a manual fallback, not the primary scheduled runner.

## Architecture

1. Railway API ingests feedback and system signals into private database tables.
   Raw screenshots, transcripts, match details, and tester identities stay in
   Postgres/object storage, not GitHub.
2. Railway triage, either as a cron service or one-off worker, sanitizes new
   `improvement_signals`, groups them into `improvement_work_items`, and opens
   GitHub issues only when the summary is safe.
3. GitHub labels are the public handoff. `agent-ready` means a trusted runner
   can plan work; `swarm-active` is a temporary claim; `swarm-planned` is the
   idempotent completion marker.
4. Joe's Mac is the default trusted runner. It checks Tailscale and power
   readiness, reads `agent-ready` issues plus the private DB queue, comments
   with a checklist-only plan, and updates DB run state.
5. EAS cloud builds handle normal iOS beta builds and TestFlight submission.

Keep public GitHub artifacts to product surface, platform/build metadata, error
codes, safe repro notes, and agent checklists. Do not include screenshots,
transcripts, names, phone numbers, exact locations, or private dating context.

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

Run the live local swarm planner:

```bash
./scripts/run-local-swarm-host.sh --live --limit 5
```

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

The current Mac should stay reachable over Tailscale at:

```text
joes-macbook-pro-3-1.tailc35824.ts.net
100.97.186.33
```

Tailscale SSH should be enabled on the Mac host. From another trusted tailnet
machine, connect with:

```bash
tailscale ssh joewilson@joes-macbook-pro-3-1.tailc35824.ts.net
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

The GitHub Actions workflow is manual-only now. Use it when the Mac is
unavailable or when you want a cloud dry-run. Cloud runners should prefer
explicit environment secrets over the local wrapper. The runner comments with
deterministic markers, so retries should not duplicate plan comments.

## EAS Cloud Builds

Normal beta builds do not need a Mac. The mobile package still lives at
`artifacts/bumble-mobile` while the Expo scaffold is becoming HeyTelli:

The GitHub Actions workflow `.github/workflows/ios-beta-build.yml` starts an
EAS iOS beta build automatically on `main` pushes that touch mobile or shared
client files. It auto-submits by default when the `EXPO_TOKEN` repository secret
is configured. Without that secret, the workflow logs a notice and skips the EAS
build instead of failing unrelated merges.

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

Everything else can run from Railway, GitHub, EAS, or a Linux runner when the
Mac is unavailable.
