# Autonomous Feedback-to-PR Loop Design

## Objective

Build a continuous improvement engine for HeyTelli that turns product signals into shipped fixes without making Joe the queue. The system should ingest feedback, crashes, API errors, failed workflows, and later analytics signals; store raw signal data privately; sanitize and classify the signal; create safe GitHub issues; dispatch agents to research and implement; auto-review, auto-merge, deploy, monitor, and roll back when needed.

The first implementation should start with in-app feedback because HeyTelli already has a `product_feedback` table and `/feedback` API. The design must leave room for crashes, logs, API failures, analysis failures, auth failures, and analytics signals to use the same pipeline.

## Existing Foundation

HeyTelli already has:

- `product_feedback` table with `userId`, `matchId`, `event`, `answer`, `context`, and `createdAt`.
- `POST /api/feedback` route protected by auth.
- Product-safe feedback normalization that only accepts allowlisted context keys.
- Mobile beta feedback cards that send Yes / Maybe / No answers from product moments.
- GitHub remote `joewilsonai/heytelli`.
- Railway API deploy path and TestFlight beta path.

This feature extends those pieces rather than replacing them.

## Core Principle

Raw user signal stays private. Public or semi-public engineering artifacts only receive sanitized, product-safe summaries.

Joe should receive digests, not approval tasks. The autonomous system decides what to do using policy, risk gates, test results, review agents, and rollback monitoring.

## Signal Sources

Version 1 supports in-app feedback and is designed to accept the other sources below.

### V1 Source

- In-app feedback from mobile surfaces.

### Near-Term Sources

- Client-side caught errors.
- API errors and failed requests.
- Screenshot upload failures.
- Screenshot analysis failures.
- Auth/session failures.
- Date Card/share failures.
- Voice transcription or debrief failures.
- TestFlight/beta onboarding confusion.

### Later Sources

- Crash reporting.
- Session analytics.
- Repeated support-like chat messages.
- PostHog or other product analytics.
- App Store/TestFlight feedback.
- Logs and health check anomalies.

## Data Model

Keep `product_feedback` for simple captured beta answers, but add a more general improvement pipeline.

### `improvement_signals`

Canonical raw/private signal table.

Fields:

- `id`
- `user_id` nullable for system signals
- `match_id` nullable
- `source` enum-like text: `in_app_feedback`, `client_error`, `api_error`, `analysis_failure`, `auth_failure`, `share_failure`, `analytics`, `crash`, `system_monitor`
- `severity` enum-like text: `info`, `low`, `medium`, `high`, `critical`
- `raw_payload` jsonb private
- `sanitized_summary` text nullable
- `sanitized_payload` jsonb nullable
- `privacy_risk` enum-like text: `low`, `medium`, `high`, `blocked`
- `fingerprint` text for dedupe
- `status` enum-like text: `new`, `triaged`, `grouped`, `actionable`, `waiting_for_signal`, `blocked`, `resolved`, `ignored`
- `created_at`
- `updated_at`

### `improvement_work_items`

Private canonical work queue.

Fields:

- `id`
- `title`
- `summary`
- `category` enum-like text: `bug`, `ux_confusion`, `feature_request`, `safety_issue`, `performance`, `reliability`, `privacy`, `copy`, `docs`, `test`
- `priority` enum-like text: `p0`, `p1`, `p2`, `p3`
- `risk_tier` enum-like text: `safe_auto_merge`, `guarded_auto_merge`, `extra_agent_review`, `no_auto_merge`
- `impact_score`
- `confidence_score`
- `frequency_count`
- `signal_ids` jsonb array of signal ids
- `github_issue_url` nullable
- `github_issue_number` nullable
- `branch_name` nullable
- `pull_request_url` nullable
- `pull_request_number` nullable
- `status` enum-like text: `draft`, `issue_created`, `researching`, `planned`, `building`, `reviewing`, `changes_requested`, `checks_running`, `merged`, `deployed`, `monitoring`, `rolled_back`, `closed`
- `created_at`
- `updated_at`

### `improvement_runs`

Audit trail for autonomous agent actions.

Fields:

- `id`
- `work_item_id`
- `run_type`: `triage`, `research`, `implementation`, `review`, `merge`, `deploy`, `monitor`, `rollback`
- `agent_name`
- `status`: `started`, `succeeded`, `failed`, `blocked`
- `summary`
- `logs_url` nullable
- `metadata` jsonb
- `created_at`
- `completed_at` nullable

## Mobile Feedback UX

Feedback must be easy enough for beta testers to use without derailing the main app.

### Entry Points

- Global Settings: "Send feedback"
- Match detail: feedback on Read, Date Card, Date Mode, Timeline, Chat, Voice Debrief
- Error states: "Tell us what happened"
- Post-action moments: after import, reanalysis, Date Card share, debrief

### Feedback Form

Fields:

- Type: Bug, Confusing, Idea, Safety concern, Love this
- Short message
- Optional surface auto-filled by the app
- Optional "Can HeyTelli include technical context?" toggle, default on

The UI should reassure:

"Thanks. Telli will use this to improve the app. We do not include screenshots or private conversations in engineering issues."

## Backend API

Add a new endpoint while keeping `/feedback` for lightweight beta prompts.

### `POST /api/improvement/signals`

Accepts:

- `source`
- `type`
- `message`
- `matchId`
- `surface`
- `clientContext`
- `technicalContextConsent`

Rules:

- Auth required for user-submitted feedback.
- Do not accept screenshots, raw transcripts, phone numbers, or large blobs from the client.
- Normalize and store raw payload privately.
- Generate fingerprint.
- Queue triage.

### Internal Admin Endpoints

For observability and debugging:

- `GET /api/admin/improvement/signals`
- `GET /api/admin/improvement/work-items`
- `GET /api/admin/improvement/work-items/:id`

These are admin-token or admin-role protected.

## Triage Worker

The triage worker runs as a repo script in V1 and is deployed as a Railway cron service. It owns signal sanitization, work-item creation, and sanitized GitHub issue creation without depending on a local gateway.

Responsibilities:

1. Load new signals.
2. Sanitize raw payload.
3. Classify category.
4. Assign severity and priority.
5. Compute privacy risk.
6. Dedupe into existing work items when fingerprints or semantic similarity match.
7. Decide next status.
8. Create or update work item.
9. Create GitHub issue when actionable and safe.

## Sanitization Policy

Remove or abstract:

- Match full names beyond first name when not needed.
- Phone numbers.
- Email addresses.
- Addresses and exact locations unless the bug is location-specific.
- Raw screenshots.
- Transcript text.
- Sexual details.
- Safety-sensitive dating details that are not necessary to reproduce the issue.
- Any content that could identify a tester or match.

Allowed in GitHub issues:

- Product surface.
- Platform.
- Build number.
- Error codes.
- API route names.
- Sanitized behavior summary.
- Reproduction steps that do not include private content.
- Expected vs actual behavior.
- Relevant file/module guesses.

## GitHub Issue Creation

Create an issue only when the work item is actionable and privacy risk is not blocked.

Issue format:

- Title: concise product/technical issue.
- Body:
  - Sanitized summary.
  - Source and frequency.
  - Affected surface.
  - Expected behavior.
  - Actual behavior.
  - Reproduction notes.
  - Privacy note: "No private screenshots/transcripts included."
  - Suggested agent tasks.
- Labels:
  - `feedback`
  - category label
  - priority label
  - risk tier label
  - `agent-ready` when ready for automation

## Agent Workflow

Agents should operate from GitHub issues and work item state.

V1 runner command:

- `pnpm --filter @workspace/scripts run improvement:swarm -- --dry-run`
- `./scripts/run-improvement-swarm.sh`

The runner consumes `agent-ready` issues directly from GitHub plus the private `improvement_work_items` queue. It does not depend on a local webhook gateway or hidden machine state.

The runner uses `swarm-active` as a temporary claim label and `swarm-planned` as the durable GitHub-side completion label. Comments include a deterministic marker so retries can resume without posting duplicate plan comments.

### Research Agent

Responsibilities:

- Inspect relevant code.
- Read related docs.
- Search for duplicate issues/work items.
- Identify likely implementation area.
- Decide feasibility.
- Update work item with research summary.

Outputs:

- `auto_fix`
- `needs_design`
- `needs_more_signal`
- `wont_do`

### Builder Agent

Responsibilities:

- Create branch.
- Implement smallest viable fix.
- Add or update tests.
- Update docs when useful.
- Open PR.

### Review Agents

Separate review passes:

- Product fit review.
- Privacy/safety review.
- Code review.
- Test review.

### Merge Agent

Can merge when:

- Required checks pass.
- Required agent reviews pass.
- Risk tier allows auto-merge.
- PR only touches allowed areas for its tier.

## Risk Gates

### `safe_auto_merge`

Allowed to merge automatically after standard checks.

Examples:

- Copy edits.
- Small UI polish.
- Docs.
- Test-only changes.
- Simple display bugs.
- Non-sensitive feedback UI improvements.

### `guarded_auto_merge`

Allowed to merge automatically after stronger agent review.

Examples:

- Non-sensitive backend behavior.
- Small DB additive changes.
- Non-emergency date-flow UX.
- AI prompt refinements that do not change safety-critical advice.

Requirements:

- Product review agent passes.
- Privacy review agent passes.
- Tests pass.
- Smoke test plan exists.

### `extra_agent_review`

Allowed to merge only after multiple specialized agent reviews pass.

Examples:

- Auth/session behavior.
- Screenshot storage and purging.
- Deletion/export.
- Date Mode quick actions.
- Safety messaging.
- AI analysis that affects high-stakes user guidance.

Requirements:

- Privacy review pass.
- Safety review pass.
- Backend/API review pass when applicable.
- Regression tests.
- Rollback plan.
- Post-deploy monitor.

### `no_auto_merge`

Agents can research, plan, and open PR, but cannot merge.

Examples:

- Billing.
- Legal/privacy policy changes.
- Destructive migrations.
- Public launch/release switches.
- Anything with unclear user-data exposure.

This tier should be rare. Joe is still not the default queue; the system should either break the work into safer pieces or hold it for more signal.

## Deployment and Rollback

### Backend

- After merge to `main`, deploy to Railway.
- Run health check.
- Run smoke checks for affected API routes.
- Monitor logs for a short window.
- If failure threshold is crossed:
  - Revert merge commit or redeploy previous Railway deployment.
  - Mark work item `rolled_back`.
  - Create follow-up issue with evidence.

### Mobile

Without OTA updates, mobile rollback requires a new TestFlight/App Store build.

V1 behavior:

- Auto-merge mobile PRs only if tests pass and risk gate allows.
- Build submission can be automated for beta builds.
- Production/App Store submission should remain a separate policy later.

Future:

- Add EAS Update for JS-only changes so low-risk UI fixes can ship and roll back faster.

## Digest

Joe receives a digest, not tasks.

Digest contents:

- New signals received.
- Work items created.
- Issues opened.
- PRs opened.
- PRs merged.
- Deploys completed.
- Rollbacks.
- Items waiting for more signal.
- Items blocked by policy.

Delivery can start as an admin endpoint or generated markdown report. Later it can go to email, Slack, iMessage, or a HeyTelli admin dashboard.

## Privacy and Safety Red Lines

The system must never put these into GitHub:

- Raw screenshots.
- Full transcripts.
- Phone numbers.
- Email addresses.
- Exact addresses.
- Detailed user/match identities.
- Highly sensitive dating or safety disclosures unless fully abstracted.

The system must prefer a vague but safe issue over a detailed issue that leaks private context.

## V1 Build Scope

V1 should include:

- New `improvement_signals`, `improvement_work_items`, and `improvement_runs` schema.
- New mobile feedback form.
- New backend signal endpoint.
- Triage worker script.
- Sanitizer/classifier.
- GitHub issue creator.
- Work item state machine.
- Basic agent handoff hooks.
- Risk-tier policy.
- Digest generator.

V1 includes the full autonomous path for `safe_auto_merge` work: triage, sanitized issue creation, research handoff, implementation branch, PR, review checks, merge, backend deploy when relevant, monitor, and rollback/revert on failure. Higher-risk tiers can still produce PRs and reviews in V1, but they must satisfy the stronger agent gates before merge.

## Non-Goals

- No public feedback portal.
- No raw screenshot forwarding.
- No raw transcript forwarding.
- No user-facing promise that every request will ship.
- No manual Joe approval step for ordinary work.
- No direct production mobile release without TestFlight policy.

## Testing Strategy

Backend tests:

- Feedback normalization rejects sensitive context.
- Signal endpoint stores allowed data.
- Sanitizer removes phone/email/location-like data.
- Triage dedupes repeated signals.
- Risk tier assignment works for sensitive categories.
- GitHub issue body excludes private fields.

Mobile tests:

- Feedback entry points exist.
- Feedback form does not allow screenshots/transcripts.
- Error states can submit feedback.
- Success message uses privacy-safe language.

Worker tests:

- New signal becomes work item.
- Duplicate signal increments frequency.
- Actionable work item creates sanitized issue.
- Blocked privacy risk does not create GitHub issue.
- Work item state transitions are valid.

Operational tests:

- Dry-run mode creates no GitHub issue.
- Live mode creates issue with expected labels.
- Digest includes created/merged/blocked/rolled-back counts.

## Resolved Implementation Defaults

- GitHub automation uses a repository-scoped token from `~/.luna/secrets/keys.env` or deployment environment variables. Tokens are never stored in the database.
- V1 orchestration uses GitHub issues and labels as the durable handoff, with the HeyTelli swarm runner consuming `agent-ready` issues directly. The database remains the canonical private queue.
- V1 auto-merges `safe_auto_merge` PRs when checks and review agents pass. `guarded_auto_merge` and `extra_agent_review` can merge only after their stronger review gates pass.
- V1 can auto-deploy backend/API changes to Railway after merge and smoke tests. Mobile changes can create and submit TestFlight beta builds, but production App Store release remains out of scope.
- EAS Update is deferred. Until it exists, mobile rollback requires another beta build, so mobile auto-merge risk classification is stricter than backend/web.
