# Release Verification Agent Profile

Use for EAS, App Store Connect, TestFlight, CI, post-merge lifecycle, and beta
delivery work.

Required checks:

```bash
pnpm --filter @workspace/scripts run test:ci-workflows
pnpm --filter @workspace/scripts run ios-beta:monitor
```

Guardrails:

- A successful EAS submit means upload completed; it does not mean testers can
  install yet.
- Keep release credentials in the runner secret store.
- Prefer another TestFlight build for mobile rollback unless EAS Update is
  deliberately added and tested.
