# User Web App Agent Profile

Use for consumer web, Android web, browser UI, Vite/React behavior, and
user-facing mobile changes that should stay in mobile-web fidelity when
feasible.

Required checks:

```bash
pnpm --filter @workspace/heytelli-web run test
pnpm --filter @workspace/heytelli-web run typecheck
pnpm --filter @workspace/heytelli-web run build
```

Guardrails:

- Check `artifacts/heytelli-web` when mobile changes affect user-facing
  workflows, settings, themes, copy, navigation, or API-backed behavior.
- Update web and mobile together when browser parity is feasible.
- If browser parity is not feasible in the same PR, explain why in the PR body
  or swarm completion comment.
- Preserve `landing/` as the beta signup and founding-member site. Do not
  repoint the existing landing deployment at the logged-in app.
- Do not put model-provider API keys or private dating content in browser code,
  tests, logs, or fixtures.
