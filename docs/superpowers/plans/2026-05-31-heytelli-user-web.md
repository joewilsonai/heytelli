# HeyTelli User Web App Plan

## Goal

Create a fresh, mobile-first HeyTelli web app that can be used from desktop browsers and Android web without exposing the legacy internal `bumble-reply` UI to consumers.

## Scope

- Add a new workspace app at `artifacts/heytelli-web`.
- Reuse the generated API client in `lib/api-client-react`.
- Support beta sign-in with email/invite code, storing the existing bearer token locally for web sessions.
- Provide the core user workflow:
  - match list
  - upload screenshots to create a match
  - match detail with Calm Read, safety/clarity/pace lenses, evidence, timeline, date prep, notes, transcript
  - HeyTelli chat
  - settings/sign-out/API base controls
- Make the first screen the usable product, not a marketing page.
- Keep Android/mobile ergonomics first: responsive app shell, bottom navigation, safe-area spacing, readable touch targets, and no desktop-only assumptions.

## Non-Goals

- Do not migrate or remove `artifacts/bumble-reply`; it remains an internal/admin companion.
- Do not replace or repoint `landing/`; it remains the public beta signup and
  founding-member surface.
- Do not add hosted trusted-circle/friend workspaces.
- Do not implement a full production deployment pipeline in this pass.
- Do not store provider keys or direct AI calls in the browser.

## Implementation Steps

1. Add the `@workspace/heytelli-web` package, Vite config, TypeScript config, and test script.
2. Add tests first for web contract, auth/session helpers, upload helper behavior, match view-model behavior, and mobile CSS expectations.
3. Implement auth/session setup and generated API client configuration.
4. Implement reusable app shell, navigation, status/empty/error states, and safe object URL/upload helpers.
5. Implement pages for sign-in, dashboard, add match, match detail, chat, and settings.
6. Add app CSS with mobile-first layout rules and desktop expansion.
7. Run package tests, typecheck, build, and a local browser smoke test.
8. Commit and open a PR for the website branch.

## Verification

- `pnpm --filter @workspace/heytelli-web run test`
- `pnpm --filter @workspace/heytelli-web run typecheck`
- `pnpm --filter @workspace/heytelli-web run build`
- Browser smoke test at a local Vite URL across mobile and desktop viewport sizes.
