# HeyTelli Runbook

## Product

HeyTelli is an iOS-first private dating clarity and safety memory layer for women. Phase 1 is mobile-first. Web is internal/admin only.

## Commands

- `pnpm install` — install workspace dependencies.
- `pnpm typecheck` — full workspace typecheck.
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas after editing `lib/api-spec/openapi.yaml`.
- `pnpm --filter @workspace/api-server run dev` — run the API server.
- `pnpm --filter @workspace/bumble-mobile run dev` — run the Expo mobile app scaffold.
- `pnpm --filter @workspace/bumble-reply run dev` — run the web/admin scaffold.

## Product Guardrails

- Do not add ratings, rankings, toxicity scores, safety scores, diagnoses, or danger verdicts.
- Do not create friend accounts or friend-facing hosted connection pages.
- Do not store third-party assessments as objective facts.
- Store the user's own reflections and neutral event facts.
- Treat raw screenshots as transient whenever technically possible.

## Implementation Priority

First prove inbound iOS share-sheet screenshot intake. If Expo/EAS cannot support a reliable "Share to HeyTelli" flow, implement a native iOS share extension before the broader product conversion.
