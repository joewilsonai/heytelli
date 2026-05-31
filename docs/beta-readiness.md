# HeyTelli Beta Readiness

## Current Beta Surfaces

- Hosted API: `https://heytelli-api-production.up.railway.app`
- Railway project: `heytelli`
- Railway services: `heytelli-api`, `Postgres`
- Railway bucket: `heytelli-uploads`
- iOS bundle id: `ai.joewilson.heytelli`
- Share extension id: `ai.joewilson.heytelli.ShareExtension`
- App group: `group.ai.joewilson.heytelli`

## Beta Access

Beta testers sign in with their email address and the beta invite code configured
on the API service. Do not commit or publish the active invite code; store it in
the API service environment.

Each tester gets an isolated user record. Matches, screenshots, reads, tags,
date cards, profile analysis, and debrief history are scoped by user id on the
API. The API should return `401` for protected data without a bearer token.

## Build And Install Paths

Use TestFlight for real beta testers. The app depends on native modules and a
share extension, so Expo Go is not a valid beta distribution path.

Merges to `main` that touch the mobile app or generated API client now trigger
the `iOS Beta Build` GitHub Actions workflow. Push-triggered builds run the
`beta` EAS profile and submit the completed build to TestFlight by default, so
safe merged mobile changes reach testers without a manual release hop. Use a
manual workflow run with `submit=false` only for deliberate smoke builds that
should not reach TestFlight.

The workflow needs a repository secret named `EXPO_TOKEN`. Create an Expo access
token from the Expo dashboard and store it in GitHub Actions secrets. Until the
secret exists, the workflow intentionally exits with a notice instead of failing
every merge.

Manual runs are available from GitHub Actions with controls for:

- EAS profile: `beta`, `development`, or `production`.
- Whether to submit after build completion. This defaults on; turn it off only
  for ordinary smoke builds that should not reach testers.
- Optional EAS build message.

From the mobile app directory:

```bash
cd /Users/joewilson/pythonprojects/heytelli/artifacts/bumble-mobile
pnpm dlx eas-cli@latest build -p ios --profile beta
```

After the build finishes, submit it:

```bash
cd /Users/joewilson/pythonprojects/heytelli/artifacts/bumble-mobile
pnpm dlx eas-cli@latest submit -p ios --profile beta --latest
```

Important: run EAS submit from `artifacts/bumble-mobile`. Do not use
`pnpm --dir artifacts/bumble-mobile dlx eas-cli ...` from the repo root for
submission; in practice that made EAS inspect the monorepo workspace package and
try to configure `@thenelseif/workspace` instead of the HeyTelli Expo project.

Successful submit output means the binary was uploaded to App Store Connect and
Apple is processing it. That is not the same as an immediately installable
TestFlight build. Check processing and tester availability here:

```text
https://appstoreconnect.apple.com/apps/6773488324/testflight/ios
```

The local swarm host also runs the App Store Connect API monitor when
credentials are configured:

```bash
APP_STORE_CONNECT_ISSUER_ID=<issuer id>
APP_STORE_CONNECT_KEY_ID=<key id>
APP_STORE_CONNECT_PRIVATE_KEY=<p8 private key>
HEYTELLI_APP_STORE_APP_ID=6773488324
pnpm --filter @workspace/scripts run ios-beta:monitor
```

The monitor reports `waiting`, `processing`, `available`, `failed`, `expired`,
or `unknown`. Treat TestFlight as done only when the build is available to
testers, not merely when EAS upload/submission succeeds.

For Joe-only device testing with a dev client:

```bash
cd /Users/joewilson/pythonprojects/heytelli/artifacts/bumble-mobile
pnpm dlx eas-cli@latest build -p ios --profile development
```

## Required Apple/Expo Setup

- Expo account logged in for EAS CLI.
- Apple Developer Program team with the app id, share extension id, and app
  group available to EAS credentials.
- TestFlight app record for `ai.joewilson.heytelli`.
- Internal tester group added in App Store Connect.
- External beta group and Beta App Review only when we go outside known testers.

## Smoke Test Script

Run this after every API deploy and before sending a new TestFlight build:

```bash
API_BASE=https://heytelli-api-production.up.railway.app
curl -fsS "$API_BASE/api/healthz"
```

Then test from the app:

- Fresh install opens the beta sign-in screen.
- Valid email plus invite code signs in.
- Dashboard loads without using a local tunnel.
- Share sheet can send one or more screenshots to HeyTelli.
- Upload/import creates or updates the right match.
- A second tester account cannot see Joe's matches.
- Date Card, Circle Check, voice debrief, chat, settings/profile analysis, and
  delete-match history all still work.

## Privacy Checks

- Review `docs/beta-privacy-terms.md` before expanding the tester pool.
- Keep screenshots in private object storage.
- Raw screenshots should be purged after extraction once the purge path is fully
  verified in production.
- Product feedback stays text-first. Do not enable feedback screenshot uploads
  until the app has explicit consent copy, local redaction/crop guidance,
  private owner-scoped storage, short retention, and a tested delete path.
- Do not create hosted public share pages for user data. Date Card recipient
  access is the only allowed web share surface, and it must stay private,
  expiring, first-name/logistics-only, and scoped to the user's safety plan.
- Circle contacts should remain user-scoped and should not expose private notes
  to the contact until an explicit send/check-in action exists.
- Any historical red flag or saved concern remains surfaced even if the latest
  analysis is cleaner.

## Operational Notes

- `railway.json` deploys the API from the monorepo root.
- `.railwayignore` excludes mobile native artifacts and local dependencies from
  API deploy uploads.
- `packageManager` is pinned in the root `package.json` so Railway uses pnpm 10;
  pnpm 9 rejects the current lockfile config.
- `sharp` is approved in `pnpm-workspace.yaml` so image processing native
  binaries can build in Railway.
