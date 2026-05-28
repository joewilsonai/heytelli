# HeyTelli

HeyTelli is a private AI-assisted dating clarity app for women navigating
modern online dating. It helps users import dating screenshots, reconstruct
conversation timelines, record reflections, prepare for dates, and optionally
share Vibe Check or Date Card image/messages through the native iOS share sheet.

The product is not a public review board, a "rate men" platform, a
crowdsourced accusation network, a surveillance product, an emergency service,
or an AI danger detector.

## Product Status

HeyTelli is in beta. The current product is an iOS-first Expo / React Native
app backed by a Railway API, Postgres, private object storage, and TestFlight
distribution. The consumer web app is not part of the beta; the web surface in
this repo is an internal/admin companion for operations, QA, support, and API
inspection.

The mobile app scaffold still lives under legacy package names while the repo
is being converted from an earlier Bumble/Haystack prototype. Current product
truth lives in `docs/heytelli-prd.md`, not in older scaffold language.

## What HeyTelli Does

- Imports dating app/profile/chat screenshots from the app or iOS share sheet.
- Extracts conversation text and neutral timeline events.
- Organizes each connection into a private timeline of facts and reflections.
- Supports voice or text debriefs so the user can remember how an interaction
  felt over time.
- Generates grounding prompts, date prep, and reflection support.
- Creates optional Vibe Check and Date Card shares through native sharing.
- Keeps trusted-circle collaboration outside HeyTelli, in the user's existing
  messages or group chat.

## Product Rules

- One account holder per workspace: the user.
- No friend accounts, hosted dossiers, comments, reactions, public pages, or
  multi-user workspaces.
- No ratings, risk scores, diagnoses, toxicity labels, or verdicts about
  another person.
- AI may summarize, extract neutral facts, surface interaction patterns, and
  prompt first-person reflection.
- AI must not declare anyone safe, unsafe, dangerous, manipulative, narcissistic,
  abusive, or otherwise clinically or morally labeled.
- Sharing must be user-initiated and native-first. HeyTelli does not create
  hosted connection pages for matches.
- Safety features should equip the user and preserve agency; they are not a
  substitute for emergency services, professional advice, or personal judgment.

## Repo Layout

```text
artifacts/
  api-server/          Railway API and AI orchestration
  bumble-mobile/       Current Expo mobile app scaffold, becoming HeyTelli
  bumble-reply/        Internal/admin web companion scaffold
  mockup-sandbox/      Design sandbox
lib/
  api-spec/            OpenAPI contract
  api-client-react/    Generated API client
  api-zod/             Generated Zod schemas
  db/                  Drizzle schema and DB client
docs/
  heytelli-prd.md      Product source of truth
  beta-readiness.md    Beta build, TestFlight, and smoke-test checklist
  beta-privacy-terms.md Beta-stage privacy and terms summary
  backend-setup.md     Railway/API/storage setup
```

## Local Commands

```bash
pnpm install
pnpm typecheck
pnpm --filter @workspace/api-spec run codegen
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/bumble-mobile run dev
pnpm --filter @workspace/bumble-reply run dev
pnpm --filter @workspace/scripts run local-swarm-host:check
./scripts/run-swarm-executor.sh --dry-run --limit 5
```

Backend deployment setup lives in `docs/backend-setup.md`. Beta install and
smoke-test guidance lives in `docs/beta-readiness.md`. The optional
feedback-to-PR runbook lives in `docs/mac-optional-improvement-loop.md`.

## Required Environment

Secrets live outside the repo. Cloud runners should use GitHub, Railway, Expo,
Apple/EAS, and provider secret stores. For local development, load API keys
from:

```bash
source ~/.luna/secrets/keys.env
```

Do not commit API keys, auth tokens, invite codes, private tester data,
screenshots, transcripts, phone numbers, addresses, or private dating details.

## Beta Privacy Summary

This section is a beta-stage product summary, not legal advice and not a claim
of regulatory compliance.

HeyTelli handles sensitive interpersonal context. The beta privacy posture is:

- User data is scoped to the signed-in beta tester account.
- Screenshots are treated as temporary analysis inputs where possible.
- Extracted text, timeline facts, reflections, tags, date prep, and debriefs are
  stored to power the app experience.
- Raw screenshot retention should be minimized, and raw screenshot purge remains
  a release gate before broader external beta distribution.
- Data should stay in private API/database/object-storage systems, not GitHub
  issues, logs, screenshots, demos, or public docs.
- Native shares are created only when the user chooses to share.
- HeyTelli does not create public or searchable pages about matches.
- Users should be able to request deletion/export support during beta; product
  surfaces for self-serve deletion/export should remain a priority.

See `docs/beta-privacy-terms.md` for the fuller beta privacy and terms wording.

## Beta Terms Summary

This beta is experimental software. Testers should expect bugs, incomplete
features, changing data models, and occasional data resets. HeyTelli is for
reflection, organization, and preparation; it does not provide legal, medical,
mental-health, law-enforcement, emergency, or personal-safety guarantees.

Users are responsible for what they import, write, and choose to share outside
the app. They should avoid uploading content they do not have a lawful or
reasonable basis to use, and they should avoid sharing another person's private
information through HeyTelli-generated cards or messages.

See `docs/beta-privacy-terms.md` for fuller beta-stage terms.

## Documentation Map

- `docs/heytelli-prd.md`: current product source of truth.
- `docs/safety-roadmap.md`: feature ordering and explicit safety non-goals.
- `upcoming_features.md`: near-term beta feature queue.
- `docs/beta-readiness.md`: current beta build/install/checklist notes.
- `docs/backend-setup.md`: Railway API, Postgres, object storage, and env setup.
- `docs/beta-privacy-terms.md`: beta privacy and terms wording.
- `docs/PRD-bumble-crm-mobile.md`: historical scaffold PRD kept for reference;
  do not use it as current product truth.
