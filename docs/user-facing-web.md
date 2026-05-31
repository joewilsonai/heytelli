# User-Facing Web App

`artifacts/heytelli-web` is the consumer HeyTelli web app for desktop browsers
and Android web. It is separate from `artifacts/bumble-reply`, which remains an
internal/admin companion.

It is also separate from `landing/`, which is the public beta signup surface.
Keep the existing `heytelli-landing` Vercel project pointed at `landing/` so the
waitlist/founding-member flows stay intact. The logged-in web app should get its
own deployment target, such as `app.heytelli.com`, a separate Vercel project, or
an explicitly scoped `/app` deployment after the landing routes are protected by
rewrites.

## What It Supports

- Beta sign-in with the existing email + invite-code API flow.
- Match list and match detail views.
- Screenshot upload through the existing presigned object-storage API.
- Match creation from uploaded screenshots.
- Additional screenshot uploads for an existing match.
- Calm Read, safety, clarity, pace, evidence, timeline, notes, and date-prep
  views backed by the current match API fields.
- HeyTelli chat through the existing conversation endpoints and SSE response
  stream.
- Settings for color theme, sign-out, and an optional API base URL.

The web app does not call model providers directly and does not expose OpenAI,
Anthropic, OpenRouter, Langfuse, or LiteLLM keys in the client.

## Mobile-Web Fidelity

When an issue, PR, or in-app feedback item changes a user-facing mobile
workflow, setting, color theme, copy string, navigation concept, or API-backed
behavior, check whether `artifacts/heytelli-web` needs the equivalent change.

Default expectation:

- Update mobile and web together when the behavior is feasible in the browser.
- Keep Android web ergonomics in mind: touch targets, safe-area spacing, small
  screens, and no desktop-only flows.
- Preserve native-only boundaries. iOS share extensions, TestFlight delivery,
  and native share-sheet artifacts do not need fake web replacements.
- If parity is not feasible in the same PR, say why in the PR body or swarm
  completion comment.

For shared options such as themes, keep web tests tied to the mobile source so a
new mobile option fails loudly until web is updated too.

## Deployment Boundary

Do not replace the public landing deployment with this app. The current landing
site contains beta signup flows in `landing/index.html` and the
founding-member reservation page in `landing/founding-member.html`. Those pages
use the public waitlist endpoint and should remain available to visitors.

Recommended deployment shape:

```text
heytelli.com          -> landing/
www.heytelli.com      -> landing/
app.heytelli.com      -> artifacts/heytelli-web
api.heytelli.com      -> artifacts/api-server or Railway API
```

For Vercel, create a second project for `artifacts/heytelli-web` instead of
changing the root directory of `heytelli-landing`. Configure:

```text
Root Directory: artifacts/heytelli-web
Install Command: pnpm install
Build Command: pnpm --filter @workspace/heytelli-web run build
Output Directory: artifacts/heytelli-web/dist/public
```

Set `VITE_API_BASE_URL` only if the app is not served behind the same origin as
the API. Do not add model-provider API keys to the Vercel web app environment.

## Local Development

Run the API and web app in separate shells:

```bash
PORT=3001 pnpm --filter @workspace/api-server run dev
PORT=5174 API_PROXY_TARGET=http://localhost:3001 pnpm --filter @workspace/heytelli-web run dev
```

Open:

```text
http://localhost:5174
```

For a hosted API, either set `VITE_API_BASE_URL` at build time or use the API
base field on the sign-in/settings screens.

## Verification

```bash
pnpm --filter @workspace/heytelli-web run test
pnpm --filter @workspace/heytelli-web run typecheck
pnpm --filter @workspace/heytelli-web run build
```

The app also relies on Rollup's native macOS optional dependency for local Vite
builds, so the workspace dependency overrides allow Rollup's macOS packages.

## Current Limitations

- This is a browser app, not a replacement for native iOS share extension flows.
- Web image previews fetch private objects through the authenticated API and use
  temporary blob URLs in the browser.
- Trusted-circle/friend collaboration is intentionally not exposed as a hosted
  workspace.
- Deployment wiring is a follow-up once the product route and hostname are
  chosen.
