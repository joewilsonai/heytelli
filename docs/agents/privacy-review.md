# Privacy Review Agent Profile

Use for privacy, safety, auth, storage, deletion, and extra-review work.

Required checks:

```bash
git diff --check
pnpm run typecheck
```

Guardrails:

- Do not copy private database rows into GitHub-visible surfaces.
- Check screenshots, transcripts, names, phone numbers, addresses, auth tokens,
  exact locations, and private dating details are absent from issues, prompts,
  PRs, logs, fixtures, and docs.
- Block changes that weaken shipped privacy or safety behavior.
