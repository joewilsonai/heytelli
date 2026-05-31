# Expo Mobile Agent Profile

Use for iOS, Expo, share extension, mobile UI, TestFlight, and generated client
work.

Required checks:

```bash
pnpm --filter @workspace/bumble-mobile run typecheck
pnpm --dir scripts exec tsx --test ../artifacts/bumble-mobile/lib/improvement-feedback-ui.test.ts
```

Guardrails:

- Preserve native iPhone sharing and beta sign-in flows.
- Do not add hosted sharing surfaces for private user data.
- Treat TestFlight as done only after App Store Connect processing and tester
  availability.
