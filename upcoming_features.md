# HeyTelli Upcoming Features

This is the active near-term roadmap only. It should not list features that are
already shipped; shipped behavior belongs in the README, PRD, specs, rollout
notes, or changelog.

Current product truth lives in `docs/heytelli-prd.md`.

## Priority Order

1. Privacy and signal foundation cleanup
2. Safe Date Flow real-device verification and guided-flow polish
3. First-run onboarding
4. Match memory and timeline upgrade
5. Story Check, durable green flags, and cross-match patterns
6. Dating profile compatibility integration
7. Vet Packet

## 0. Privacy And Signal Foundation Cleanup

**Goal:** Finish the trust-sensitive foundation before adding more safety
intelligence.

### Remaining Work

- Remove or fully isolate legacy score fields from active contracts:
  - `sexPotential`
  - `conversionAbility`
  - `chemistry`
- Migrate score history toward neutral pattern history so new code does not need
  score-shaped placeholders.
- Verify the production raw-screenshot purge path end to end with real beta
  uploads, including failure logging and retry behavior.
- Keep local iPhone screenshot review/resubmit working after backend raw images
  are purged.
- Add a Settings preference for automatically running Analyze new after
  screenshot upload only after cost controls, privacy copy, rate limits, and
  failure recovery are clear.
- Add a clearer self-serve export/deletion path for beta users.

### Success Criteria

- UI and generated clients no longer depend on legacy score labels.
- Raw backend screenshots are purged in production after successful analysis
  while local review/resubmit still works on the user's iPhone.
- No home, read, timeline, or sort surface ranks matches by legacy scores.
- Automatic analysis can be turned on without surprising the user or silently
  increasing model spend.

## 1. Safe Date Flow Verification And Guided Polish

**Goal:** Turn the existing date tools into one obvious guided path from "I have
plans" to "my circle knows, I have a plan, and I can debrief after."

### Remaining Work

- Run a real iPhone/TestFlight smoke test for the full Date Card path:
  - create or update a date plan;
  - select up to 3 trusted-circle people;
  - share the private Date Card link;
  - open the link as a recipient without an account;
  - tap Got it;
  - confirm sender status updates in the app.
- Make the match screen and home dashboard surface one clear next step when
  `nextDateAt`, `nextDateLocation`, or date safety details exist.
- Convert scattered date controls into a guided checklist/stepper:
  - Date details
  - Match review
  - Circle setup
  - Date Card
  - Date Mode
  - After-date debrief
- Ensure Date Mode quick actions create calm, shareable circle messages and not
  only local status updates.
- Add an after-date prompt when the date ends, becomes past due, or Date Mode is
  closed.

### Success Criteria

- A beta tester can create and share a private Date Card from TestFlight in
  under 60 seconds.
- A trusted person can open the link, confirm receipt, and have that status
  visible to the sender.
- A tester can turn on Date Mode without hunting through settings.
- Quick actions are understandable under pressure.
- The post-date debrief lands in timeline memory.

## 2. First-Run Onboarding

**Goal:** Make the first session obvious for a new beta tester.

### Remaining Work

- Add a first-launch path instead of relying only on the home empty state.
- Lead with one promise:
  - "Import a dating screenshot. HeyTelli turns it into a private read,
    patterns, and safer next steps."
- Make the first task screenshot import from Photos or Share to HeyTelli.
- Explain the core loop:
  - Import screenshots
  - Get a read
  - Track patterns
  - Plan dates safely
  - Debrief after
- Explain the main app areas:
  - Read
  - Story
  - Date
  - Talk
- Show privacy basics before the first import:
  - Raw screenshots are minimized after analysis where possible.
  - Circle shares do not include screenshots.
  - HeyTelli is private by default.
- Store onboarding completion and allow the user to reopen the guide from
  Settings or Trust Center.

### Success Criteria

- New testers know where to start.
- New testers understand screenshot sharing into HeyTelli.
- New testers understand the difference between Read, Story, Date, and Talk.
- New testers understand what HeyTelli does not share.

## 3. Match Memory And Timeline Upgrade

**Goal:** Make HeyTelli feel like a private dating brain that remembers what
changed.

### Remaining Work

- Group timeline events into readable sections:
  - Screenshots analyzed
  - Date scheduled
  - Date Card shared
  - Date Mode started
  - Check-in sent
  - Voice/text debrief
  - Green flag seen
  - Concern seen
  - Tag added/removed
- Link timeline events back to the relevant read, transcript, screenshot batch,
  tag event, Date Card, or debrief where available.
- Add a "What changed since last time" summary.
- Add trend analysis over time:
  - More consistent
  - More distant
  - More emotionally open
  - Planning energy rising/falling
  - Concerns repeating
- Preserve important emotional moments after a match is archived or reopened.

### Success Criteria

- A user can understand the history of a match without rereading screenshots.
- Important moments do not disappear after closing the match.
- Tags, patterns, reads, and debriefs feel connected.

## 4. Story Check, Durable Green Flags, And Cross-Match Patterns

**Goal:** Help the user compare evidence over time without turning HeyTelli into
a verdict machine.

### Remaining Work

- Build Story Check as a private claim ledger:
  - first-person claims;
  - date/time evidence;
  - source event;
  - confidence level;
  - contradiction or follow-up prompts.
- Surface contradictions as evidence pairs with timestamps, never as labels or
  verdicts about the person.
- Make green flags durable and visible alongside saved concerns.
- Keep historical concerns visible even if the newest read is cleaner.
- Add cross-match pattern analysis across the user's own history:
  - repeated arcs;
  - recurring emotional themes;
  - repeated planning breakdowns;
  - repeated boundary patterns.

### Success Criteria

- Story Check helps the user remember what was said and when.
- Green flags and concerns feel equally durable.
- Cross-match analysis describes the user's repeated experiences, not other
  people's character.

## 5. Dating Profile Compatibility Integration

**Goal:** Use the user's own profile and stated standards as context for match
reads without becoming prescriptive.

### Remaining Work

- Wire saved dating-profile context into match analysis, reply prep, date brief,
  and chat dossiers.
- Add optional structured fields when needed:
  - dealbreakers;
  - must-haves;
  - relationship intent;
  - communication preferences.
- Make profile context freshness visible after the user edits profile text or
  uploads new profile screenshots.
- Show alignment language carefully:
  - "This seems aligned with what you said you want."
  - "This may be drifting from your stated standards."
  - "This is worth checking against your listed boundaries."
- Avoid judgmental or deterministic copy.

### Success Criteria

- Match reads become more personal to the user.
- The app helps her stay anchored to her own standards.
- Profile context improves planning and reply suggestions without producing
  verdicts.

## 6. Vet Packet

**Goal:** Help the user do her own pre-date reality check without HeyTelli
creating dossiers, labels, or background-check claims.

### Remaining Work

- Pull user-visible claims from Story Check:
  - name;
  - employer;
  - role;
  - city;
  - school;
  - social handle;
  - named pet/family details when relevant.
- Generate one-tap search links the user can open herself:
  - Google;
  - LinkedIn;
  - Instagram;
  - employer website;
  - NSOPW when state/name are available.
- Let the user save private observations back to the match timeline.
- Store observations, not scraped data.

### Non-Goals

- No automated background-check reports.
- No safe/unsafe labels.
- No hosted dossiers.
- No friend or public match pages.
- No automatic sharing.

### Success Criteria

- The user can run a pre-date reality check herself.
- HeyTelli never claims to verify identity, safety, criminal history, or intent.
- Saved observations remain private timeline memory.
