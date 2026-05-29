# HeyTelli Beta Privacy And Terms

> This document is beta-stage product wording for testers and contributors. It
> is not legal advice, a production privacy policy, or a claim that HeyTelli
> complies with any specific law or regulatory framework. A qualified lawyer
> should review the production privacy policy and terms before a broader launch.

## Scope

HeyTelli is a private AI-assisted dating clarity app for women. The beta helps
users import dating screenshots, organize private timelines, record reflections,
prepare for dates, and create optional native shares for their own trusted
contacts.

HeyTelli is not a public review board, background-check service, emergency
service, therapy service, law-enforcement tool, or platform for rating,
diagnosing, accusing, or surveilling another person.

## Privacy Principles

- Keep the workspace single-tenant: only the signed-in user has an account.
- Minimize raw screenshot retention and prefer extracted text and neutral
  timeline facts after analysis.
- Keep screenshots, transcripts, reflections, date details, and tester identity
  out of GitHub issues, public logs, demos, and documentation.
- Use private storage and API-auth controls for beta data.
- Share nothing externally unless the user takes an explicit share action.
- Avoid hosted pages, public dossiers, friend accounts, comments, reactions, or
  searchable records about matches.
- Treat third-party information in screenshots with care, even when the user is
  the account holder.

## Data The Beta May Process

Depending on what a tester chooses to use, HeyTelli may process:

- Account and beta access information, such as email address and auth session
  metadata.
- Uploaded screenshots and extracted OCR/transcript text.
- Connection names or labels entered by the user.
- Timeline events, tags, green flags, concerns, profile notes, and analysis
  outputs.
- Voice debrief audio or transcripts when the user records a debrief.
- Date preparation details, check-in windows, and optional trusted-contact
  labels.
- Feedback, support notes, crash/error metadata, and product analytics needed to
  operate the beta.

Testers should not upload content they do not have a lawful or reasonable basis
to use. Testers should avoid importing or sharing highly sensitive third-party
information unless it is necessary for their own dating clarity or safety plan.

## How Data Is Used

Beta data is used to:

- Authenticate beta testers and keep each tester's data scoped to their account.
- Extract text and structure from imported screenshots.
- Build private connection timelines, reads, reflections, date prep, and debrief
  history.
- Generate neutral AI summaries, grounding prompts, and reflection support.
- Debug the product, investigate support issues, improve reliability, and
  prioritize beta work.

HeyTelli should not use beta data to build public profiles, train a public
dating reputation database, sell ads, or create cross-user dossiers about
people who appear in screenshots.

## Screenshots And Retention

Screenshots are sensitive because they may include both the user's context and
third-party information. The beta target is:

- Raw screenshots are analysis inputs, not permanent product artifacts.
- Extracted text, neutral timeline facts, summaries, tags, and reflections are
  preferred over raw image retention.
- Raw screenshot purge should be verified before broader external beta.
- Local device copies may exist when the app needs them for review or resubmission
  and should be deleted when the related connection is deleted.

During beta, retention behavior may change as purge, deletion, export, and
debugging paths are hardened. Contributors should document current behavior
plainly and avoid promising deletion semantics that have not been verified.

## Feedback Attachments

Product feedback is text-first during beta. Testers can describe what happened,
and the app may include basic technical context only when the tester opts in.

Screenshot attachments for feedback should remain disabled until HeyTelli has
explicit consent copy, local redaction or crop guidance, private owner-scoped
storage, short retention, and a tested delete path. Feedback screenshots,
attachment object paths, thumbnails, transcripts, and raw private details must
not be copied into GitHub issues, pull requests, agent prompts, or public logs.

## Sharing

HeyTelli shares only when the user chooses to share. Current sharing is
native-first: the app prepares an image or message, then the user decides where
to send it through iOS sharing or messaging.

Shares should avoid screenshots by default. Vibe Check and Date Card shares
should use minimal, user-controlled context such as first names or labels, date
time, venue text, check-in time, exit plan, and user-written notes. Date Card
recipient links may be hosted only as private, expiring safety-plan pages. The
app should not create public pages, searchable links, hosted match profiles, or
comment threads about another person.

## AI Output Boundaries

AI output must stay neutral and reflective:

- It may summarize conversations, extract neutral events, compare timelines,
  identify communication rhythm changes, and suggest first-person reflection
  prompts.
- It must not diagnose, label, score, rank, or declare another person safe,
  unsafe, dangerous, manipulative, narcissistic, toxic, abusive, or similar.
- It must not replace professional advice, emergency services, legal advice,
  therapy, or the user's own judgment.

## Beta Tester Responsibilities

By using the beta, testers should understand that:

- The product is experimental and may contain bugs, incomplete flows, changing
  data models, or temporary outages.
- Testers are responsible for what they import, write, and choose to share.
- Testers should not use HeyTelli to harass, shame, dox, threaten, impersonate,
  stalk, or publicly expose another person.
- Testers should not rely on HeyTelli as an emergency service or a guarantee of
  physical, emotional, or legal safety.
- For immediate danger, testers should contact local emergency services or a
  trusted person directly.

## Contributor Responsibilities

Contributors and agent workflows must preserve tester privacy:

- Do not put raw screenshots, transcripts, real names, phone numbers, addresses,
  invite codes, auth tokens, or private dating details in GitHub issues, pull
  requests, docs, screenshots, test fixtures, or logs.
- Sanitize feedback before opening public GitHub issues.
- Use placeholders in docs and examples.
- Keep privacy/security-impacting changes out of auto-merge unless an explicit
  review policy says otherwise.
- Avoid compliance claims unless reviewed by qualified counsel.

## Deletion And Export

The beta should support deletion and export workflows as product priorities.
Until self-serve flows are fully verified, deletion/export requests should be
handled through founder/support operations and documented as operational tasks.

Do not claim that every copy is instantly or permanently removed unless the
database, object storage, logs, backups, analytics, and local device behavior
have been verified for that claim.

## Changes

Privacy and terms wording may change during beta as the product, storage model,
deletion paths, and legal review mature. Testers should be told when meaningful
privacy or terms changes affect how their data is used or retained.
