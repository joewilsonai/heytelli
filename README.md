# HeyTelli

HeyTelli is a private, women-first, iPhone-first dating clarity and safety app.
It helps users import dating app/profile/chat screenshots, reconstruct
conversation timelines, preserve reflections, prepare for dates, and optionally
share Vibe Check cards or temporary Date Card status links through native
sharing.

HeyTelli is not a generic AI dating coach, a public review board, a "rate men"
platform, a crowdsourced accusation network, a surveillance product, an
emergency service, or an AI danger detector.

## Current Status

HeyTelli is in beta / Phase 1 mobile MVP work. The product source of truth is
[`docs/heytelli-prd.md`](docs/heytelli-prd.md). Historical Bumble/Haystack
scaffold names still exist in package and directory paths, so trust the current
HeyTelli docs over legacy names.

- Mobile app: Expo / React Native, iOS-first, in
  `artifacts/bumble-mobile`.
- API: current Express service for Railway in `artifacts/api-server`.
- Database/storage: Postgres via Drizzle plus private S3-compatible object
  storage.
- Distribution: EAS Build and TestFlight. Expo Go is not the beta path because
  the app uses native modules and a share extension.
- Public landing/signup: `landing/` is the beta waitlist site and should remain
  the `heytelli-landing` Vercel project. Do not repoint that project at the
  logged-in web app.
- User web: `artifacts/heytelli-web` is the fresh consumer browser app for
  desktop and Android web. It reuses the API auth, uploads, matches, date prep,
  and chat endpoints without exposing model-provider keys in the browser. Deploy
  it as a separate app target, for example `app.heytelli.com`.
- Internal web: `artifacts/bumble-reply` remains an internal/admin companion
  for operations, QA, support, and API inspection.

## Product Rules

- One account holder per workspace: the user.
- Friends/trusted-circle members do not have accounts, post comments, or access
  a hosted workspace.
- No ratings, risk scores, diagnoses, toxicity labels, psychological labels, or
  verdicts about another person.
- AI may summarize, extract neutral facts, surface interaction patterns, and
  prompt first-person reflection.
- AI must not declare anyone safe, unsafe, dangerous, manipulative,
  narcissistic, abusive, or otherwise clinically/morally labeled.
- Sharing is user-initiated and native-first. HeyTelli does not create public
  or searchable match pages.
- The allowed web-share exception is a temporary Date Card / Check-In Link that
  shows the user's date-status plan only. It must not contain screenshots,
  transcripts, comments, ratings, AI summaries, or hosted content about the
  match.
- Safety features equip the user and preserve agency. They are not a substitute
  for emergency services, professional advice, or personal judgment.

## What The App Does

- Imports profile/chat screenshots from the app or iOS share sheet.
- Extracts conversation text and neutral timeline events.
- Organizes each connection into a private timeline of facts and reflections.
- Supports voice and text debriefs so the user can remember how an interaction
  felt over time.
- Generates grounding prompts, date prep, boundary language support, and
  reflection support.
- Creates optional Vibe Check shares and Date Card status links through native
  sharing.
- Keeps trusted-circle discussion outside HeyTelli, in the user's existing
  messages or group chat.

## Repo Map

```text
artifacts/
  api-server/          Current Express API, AI orchestration, auth, storage,
                       matches, date cards, feedback, and improvement routes.
  bumble-mobile/       Current Expo mobile app scaffold, becoming HeyTelli.
  bumble-reply/        Internal/admin web companion scaffold.
  heytelli-web/        Consumer Vite/React web app for desktop and Android web.
  mockup-sandbox/      Design sandbox.
landing/               Public beta signup and founding-member pages.
lib/
  api-spec/            OpenAPI contract and Orval codegen.
  api-client-react/    Generated React API client.
  api-zod/             Generated Zod schemas.
  db/                  Drizzle schema/client, including improvement pipeline
                       tables.
  integrations-*/      AI/provider integration packages.
  object-storage-web/  Web object-storage helper package.
scripts/
  src/improvement/     Feedback triage, swarm planning/execution, lifecycle,
                       evals, GitHub adapter, hooks, and trace helpers.
  src/iosBetaMonitor.ts App Store Connect/TestFlight processing monitor.
docs/
  heytelli-prd.md      Product source of truth.
  backend-setup.md     Railway/API/Postgres/storage/env setup.
  beta-readiness.md    Beta access, EAS/TestFlight, and smoke-test checklist.
  mac-optional-improvement-loop.md Local swarm host runbook.
  swarm-agents.md      Full autonomous improvement-loop map.
```

Workspace packages are declared in [`pnpm-workspace.yaml`](pnpm-workspace.yaml).
The root package pins `pnpm@10.28.1`.

## Local Setup

Use pnpm only:

```bash
corepack enable
pnpm install
```

Load secrets only when a command needs them:

```bash
source ~/.luna/secrets/keys.env
```

Do not commit API keys, auth tokens, invite codes, private tester data,
screenshots, transcripts, phone numbers, exact addresses, or private dating
details.

## Run Locally

Common package-script entry points:

```bash
pnpm --filter @workspace/api-spec run codegen
PORT=3001 pnpm --filter @workspace/api-server run dev
PORT=8081 pnpm --filter @workspace/bumble-mobile run dev
PORT=5174 API_PROXY_TARGET=http://localhost:3001 pnpm --filter @workspace/heytelli-web run dev
pnpm --filter @workspace/bumble-reply run dev
```

Database schema push is available after `DATABASE_URL` is set:

```bash
pnpm --filter @workspace/db run push
```

The production beta API currently lives at:

```text
https://heytelli-api-production.up.railway.app
```

Mobile builds use `EXPO_PUBLIC_API_BASE_URL`; the committed EAS profiles in
`artifacts/bumble-mobile/eas.json` point at the production beta API.

## Verification

Package-script checks exposed by the repo:

```bash
pnpm run typecheck
pnpm run typecheck:libs
pnpm --filter @workspace/api-server run test:storage
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/scripts run typecheck
pnpm --filter @workspace/scripts run test:improvement
pnpm --filter @workspace/scripts run test:local-swarm-host
pnpm --filter @workspace/scripts run test:ci-workflows
pnpm --filter @workspace/scripts run improvement:evals
pnpm --filter @workspace/scripts run local-swarm-host:check
```

API deploy smoke check:

```bash
curl -fsS https://heytelli-api-production.up.railway.app/api/healthz
```

Before changing the feedback sanitizer, risk policy, labels, swarm execution,
or beta monitor, run the relevant `@workspace/scripts` tests and
`improvement:evals`.

## API And Deployment Notes

- Railway deploys from the monorepo root using [`railway.json`](railway.json).
  The build checks libs, builds the API package, and typechecks scripts.
- API setup details and required env vars live in
  [`docs/backend-setup.md`](docs/backend-setup.md).
- The API healthcheck path is `/api/healthz`.
- The current API implementation is Express. The PRD records the longer-term
  Fastify/Railway target shape; use the code and backend setup docs for current
  operations.
- TestFlight readiness is separate from build success. A successful EAS submit
  means Apple received the binary; testers can install only after App Store
  Connect processing makes it available.

Manual EAS commands must run from the mobile app directory:

```bash
cd artifacts/bumble-mobile
pnpm dlx eas-cli@latest build -p ios --profile beta --non-interactive
pnpm dlx eas-cli@latest submit -p ios --profile beta --latest --non-interactive
```

Do not run EAS submit from the repo root with `pnpm --dir
artifacts/bumble-mobile dlx eas-cli ...`; that path has resolved the wrong
workspace/EAS identity before. See
[`docs/beta-readiness.md`](docs/beta-readiness.md) for beta access, smoke
tests, App Store Connect checks, and TestFlight details.

The GitHub workflow `.github/workflows/ios-beta-build.yml` builds iOS on pushes
to `main` that touch the mobile app or shared client packages. Push-triggered
builds submit to TestFlight by default when `EXPO_TOKEN` is configured.

## Autonomous Improvement Loop

The feedback/swarm system is a privacy-gated automation pipeline, not a support
queue and not a place to store raw user context.

High-level flow:

1. The mobile app sends beta feedback through
   `artifacts/bumble-mobile/lib/improvement-feedback.ts`.
2. The API route `artifacts/api-server/src/routes/improvement.ts` receives
   `/improvement/signals`, validates auth, and stores private signal rows.
3. The sanitizer/classifier in
   `artifacts/api-server/src/lib/improvementPipeline.ts` removes private
   context, assigns category/priority/risk, and prepares safe issue drafts.
4. The triage worker in `scripts/src/improvement/triage.ts` groups signals into
   DB-backed work items and opens sanitized private-repo GitHub issues only
   when allowed.
5. The planner/executor scripts turn `agent-ready` issues into plans, isolated
   worktrees, PRs, checks, optional reviewer lanes, and auto-merge only when
   the risk tier and configured gates allow it.
6. The lifecycle monitor tracks PR-linked work items. The iOS beta monitor
   checks App Store Connect processing when credentials are configured.

Runbook entry points:

```bash
pnpm --filter @workspace/scripts run improvement:triage -- --dry-run
pnpm --filter @workspace/scripts run improvement:swarm -- --dry-run --limit 5
./scripts/run-local-swarm-host.sh --dry-run --limit 5
./scripts/run-swarm-executor.sh --dry-run --limit 5
pnpm --filter @workspace/scripts run ios-beta:monitor
```

Live swarm runs require the trusted runner secret store and should follow
[`docs/mac-optional-improvement-loop.md`](docs/mac-optional-improvement-loop.md).
The full agent/process map, data flow, labels, risk tiers, reviewer lanes,
trace spans, and V1 limitations live in
[`docs/swarm-agents.md`](docs/swarm-agents.md).

## Privacy Boundaries

HeyTelli handles sensitive interpersonal context. The repo is private, but
GitHub issues, PRs, prompts, CI logs, and integrations are broader surfaces
than the app database.

- Raw screenshots, transcripts, match details, tester identities, phone
  numbers, exact locations, invite codes, and private dating details stay out
  of GitHub-visible artifacts.
- Private signal payloads live in Postgres/object storage under the API's
  access controls.
- Only sanitized summaries should become GitHub issues, PR bodies, agent
  prompts, comments, and logs.
- Blocked/high-privacy feedback should remain in the private database and not
  become GitHub work.
- Product feedback stays text-first. Do not enable feedback screenshot uploads
  without explicit consent copy, redaction/crop guidance, short retention, and
  a tested delete path.
- Raw screenshot retention should be minimized and purged after extraction once
  the purge path is fully verified.
- Native shares are created only when the user chooses to share.

See [`docs/beta-privacy-terms.md`](docs/beta-privacy-terms.md) for the fuller
beta privacy and terms wording.

## Documentation Map

- [`docs/heytelli-prd.md`](docs/heytelli-prd.md): current product source of
  truth.
- [`docs/safety-roadmap.md`](docs/safety-roadmap.md): safety feature ordering
  and non-goals.
- [`upcoming_features.md`](upcoming_features.md): near-term beta feature queue.
- [`docs/backend-setup.md`](docs/backend-setup.md): Railway API, Postgres,
  object storage, and env setup.
- [`docs/beta-readiness.md`](docs/beta-readiness.md): beta access,
  TestFlight, EAS, and smoke-test checklist.
- [`docs/mac-optional-improvement-loop.md`](docs/mac-optional-improvement-loop.md):
  local Mac swarm host and cloud fallback runbook.
- [`docs/swarm-agents.md`](docs/swarm-agents.md): autonomous improvement-loop
  architecture and V1 boundaries.
- [`docs/agents/`](docs/agents): repo-local specialist expectations for API,
  Expo mobile, privacy review, and release verification.
- [`docs/specs/date-card.md`](docs/specs/date-card.md): Date Card recipient
  access constraints.
- [`docs/beta-privacy-terms.md`](docs/beta-privacy-terms.md): beta-stage
  privacy and terms wording.
- [`docs/PRD-bumble-crm-mobile.md`](docs/PRD-bumble-crm-mobile.md):
  historical scaffold PRD kept for reference; do not use it as current product
  truth.
