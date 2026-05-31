# API Server Agent Profile

Use for backend routes, auth, storage, generated API schemas, and the
improvement pipeline.

Required checks:

```bash
pnpm run typecheck
pnpm --dir artifacts/api-server exec tsx --test src/lib/improvementPipeline.test.ts src/routes/improvement.test.ts
```

Guardrails:

- Keep raw feedback and private dating context in private database rows.
- Keep GitHub-visible issues, prompts, PRs, logs, and CI output sanitized.
- Update route/lib tests when API behavior changes.
