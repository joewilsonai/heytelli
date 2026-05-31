# HeyTelli Backend Setup

HeyTelli Phase 1 needs one API service, Postgres, S3-compatible object storage,
AI provider keys, and beta invite auth. The current beta API is deployed at
`https://heytelli-api-production.up.railway.app`.

## Recommended Services

1. Railway API service
   - Deploy from the repo root.
   - Use `railway.json` for build/start/healthcheck config.
   - Healthcheck path: `/api/healthz`.

2. Postgres
   - Provision a Railway Postgres service.
   - Set `DATABASE_URL` on the API service.
   - Apply schema with `pnpm --filter @workspace/db run push` after env is set.

3. S3-compatible object storage
   - Fastest path: Railway Bucket, because credentials can be injected into the
     API service as variable references.
   - Portable path: Cloudflare R2, using the same adapter and `R2_*` env vars.
   - Keep buckets private. Clients upload through presigned PUT URLs and the API
     proxies reads only where policy allows.

4. AI providers
   - Use values from `~/.luna/secrets/keys.env`.
   - Required for current code paths:
     - `AI_INTEGRATIONS_OPENAI_BASE_URL`
     - `AI_INTEGRATIONS_OPENAI_API_KEY`

5. Beta auth
   - `HEYTELLI_AUTH_SECRET` signs bearer tokens.
   - `HEYTELLI_BETA_INVITE_CODES` controls who can create/sign in to beta
     accounts.

## API Env Vars

Core runtime:

```bash
NODE_ENV=production
LOG_LEVEL=info
PORT=${{ PORT }}
DATABASE_URL=${{ Postgres.DATABASE_URL }}
HEYTELLI_AUTH_SECRET=<long random token>
HEYTELLI_BETA_INVITE_CODES=<comma-separated invite codes>
```

Storage, generic names:

```bash
S3_ENDPOINT=${{ Bucket.ENDPOINT }}
S3_BUCKET=${{ Bucket.BUCKET }}
S3_REGION=${{ Bucket.REGION }}
S3_ACCESS_KEY_ID=${{ Bucket.ACCESS_KEY_ID }}
S3_SECRET_ACCESS_KEY=${{ Bucket.SECRET_ACCESS_KEY }}
S3_PRIVATE_PREFIX=heytelli
```

The adapter also accepts Cloudflare-style aliases:

```bash
R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
R2_BUCKET=heytelli
R2_REGION=auto
R2_ACCESS_KEY_ID=<access-key-id>
R2_SECRET_ACCESS_KEY=<secret-access-key>
R2_PRIVATE_PREFIX=heytelli
```

It also accepts Railway Bucket variable names directly:

```bash
ENDPOINT=${{ Bucket.ENDPOINT }}
BUCKET=${{ Bucket.BUCKET }}
REGION=${{ Bucket.REGION }}
ACCESS_KEY_ID=${{ Bucket.ACCESS_KEY_ID }}
SECRET_ACCESS_KEY=${{ Bucket.SECRET_ACCESS_KEY }}
```

Prefer the `S3_*` names on the API service so the app code is explicit and less
likely to collide with other Railway-provided variables.

AI and product safety:

```bash
AI_INTEGRATIONS_OPENAI_BASE_URL=https://api.openai.com/v1
AI_INTEGRATIONS_OPENAI_API_KEY=<from ~/.luna/secrets/keys.env>
AI_MODEL_CALLS_DISABLED=false
AI_MONTHLY_BUDGET_WARNING_USD=250
AI_USAGE_PRICING_OVERRIDES_JSON='[]'
PURGE_RAW_SCREENSHOTS_AFTER_EXTRACTION=false
```

See `docs/ai-cost-observability.md` for the AI usage ledger, model routing, and
pricing override format.

Set `PURGE_RAW_SCREENSHOTS_AFTER_EXTRACTION=true` only after the raw-image purge
task is implemented and tested.

## Mobile Env

The mobile app prefers `EXPO_PUBLIC_API_BASE_URL` and falls back to
`EXPO_PUBLIC_DOMAIN`.

```bash
EXPO_PUBLIC_API_BASE_URL=https://heytelli-api-production.up.railway.app
```

The committed EAS profiles in `artifacts/bumble-mobile/eas.json` already point
at the current production API.

## Verification Commands

Run these locally before deploying:

```bash
pnpm run typecheck:libs
pnpm --filter @workspace/api-server run test:storage
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run build
```

Then verify the deployed API:

```bash
curl https://<api-domain>/api/healthz
```

## Deployment Order

1. Link or create the Railway project for `heytelli`.
2. Add an API service from this repo.
3. Add Postgres and set `DATABASE_URL`.
4. Add a Railway Bucket or Cloudflare R2 credentials.
5. Set OpenAI and beta auth variables.
6. Push DB schema/migrations.
7. Deploy the API service.
8. Point the Expo/EAS build at the deployed API domain.

## Current Production Gates

- TestFlight requires an EAS build because the app uses native modules and a
  share extension.
- The API is beta-auth protected and user-scoped, but raw screenshot purge
  should remain a release gate before a large external beta.
- App Store Connect/TestFlight setup still needs Expo and Apple credentials.

## Source Notes

- Railway config-as-code supports `railway.json` with build/deploy settings:
  https://docs.railway.com/config-as-code
- Railway Buckets are private S3-compatible storage and expose endpoint,
  bucket, region, access key, and secret variables:
  https://docs.railway.com/guides/storage-buckets
- Railway healthchecks use the app `PORT` and a configured healthcheck path:
  https://docs.railway.com/deployments/healthchecks
- Cloudflare R2 exposes an S3-compatible endpoint at
  `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`:
  https://developers.cloudflare.com/r2/get-started/s3/
