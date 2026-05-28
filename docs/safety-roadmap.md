# Safety Features Roadmap

> **Status:** Strategy / ordering doc.
> **Audience:** Product + engineering (human + agent contributors).
> **Updates:** Only when priorities meaningfully shift.

This document is the **build order** for HeyTelli's safety-feature work, derived from a structured research pass on what women actually want, what they already do manually, what existing dating-safety products do well and badly, and how all of that maps to the PRD's non-negotiables.

It is **not** a feature spec. Per-feature specs live in `docs/specs/<feature>.md` and are written *as each feature comes up the queue* — not all upfront. The reason: Phase 0 + Phase 1 will reshape the inputs for everything that follows.

## How this relates to other planning docs

- [`docs/heytelli-prd.md`](./heytelli-prd.md) — product positioning, non-negotiables, ethos. The source of every "do not build" line below.
- [`../upcoming_features.md`](../upcoming_features.md) — existing Safe Date Flow (7 steps), Match Memory Upgrade, First-Run Onboarding, and Dating Profile Compatibility specs. **Phase 3 + 4 deliverables map directly to its Safe Date Flow steps.** That doc remains the source of truth for step-level detail. This roadmap adds the *order*, the *missing primitives*, and the *non-goals*.
- [`docs/beta-readiness.md`](./beta-readiness.md) — beta launch checklist; orthogonal to the safety roadmap but referenced where deploy/auth dependencies exist.

## Framing — the four jobs

Women's safety work in online dating decomposes into four functional jobs. Every feature below answers exactly one:

1. **VET** — is this person real, single, dangerous? *(pre-date)*
2. **STAGE** — set the date logistics so I can leave safely. *(pre-date)*
3. **AWARE** — manage what happens during the date. *(on-date)*
4. **REMEMBER** — store patterns across time and men, so I can trust my gut later. *(post-date / cross-time)*

HeyTelli's current center of gravity is **REMEMBER** and partial **STAGE**. The roadmap closes the **VET** and **AWARE** gaps in priority order while extending REMEMBER's lead.

## Governing principle

> **Automate the friction. Preserve the agency.**

Tooling does the boring, repetitive, get-the-friend-the-right-info work. Tooling does **not** make safety decisions on the user's behalf, does **not** share anything without her hand on the button, and does **not** issue verdicts about another person.

---

## Phase 0 — Foundation

Must come first. Unblocks half the list.

### 0.1 Drop person-scoring fields from the schema
**Effort:** S–M · **Deps:** none

Remove `sexPotential`, `conversionAbility`, `chemistry` from `matches.extractedProfile.scores`. Replace with neutral qualitative signals:

- `consistencyAcrossMessages`
- `paceMatch`
- `escalationVelocity`
- `selfDisclosureBalance`

These signals describe what's *happening*, not what the match is *worth*. They become the inputs to features 1.1, 1.2, 1.3, and 2.5.

**Why now:** every REMEMBER feature below (and the brand) depends on the data model being about patterns and clarity, not rating the man. Trying to bolt new features onto the old schema re-imports the contradiction the PRD already names.

**Risk:** breaks UI surfaces and AI prompts that read the legacy fields. Single PR; centralized changes.

---

## Phase 1 — REMEMBER amplification

Goal: become the *smartest, calmest friend who remembers everything*. Highest brand leverage, rides the existing extraction pipeline.

### 1.1 Story Check (Contradiction Catcher)
**Effort:** M · **Deps:** Phase 0

Per-match **claim ledger** + **discrepancy detector**. Every chat import extracts first-person claims — `pet.dog.name`, `employer.name`, `whereabouts.<date>`, `family.sister.name`, `hometown`, etc. — and flags when later claims contradict earlier ones. UI shows side-by-side quotes with timestamps. Never a verdict.

Surfaces:
- "Story Check" section on the match detail screen
- Direct contradictions appear in the home daily brief, framed gently
- Reflection Chat can answer: *"Did Mike ever mention his dog's name?"*
- Timeline event entries (neutral phrasing)

**Plausibility scoring** is critical. Distinguish:
- *probably-fine* (job change months apart)
- *worth-a-second-look* (employer changes within weeks)
- *direct-contradiction* (two different names for the same dog in the same week)

**Why now:** brand-defining "smartest friend who remembers everything" moment. Rides existing extraction pipeline (low platform cost). Addresses three top research findings at once — catfishing, romance-scam scripts, and the Stark/Bancroft "shifting goalposts" pattern. Produces the claim ledger that feature 1.3 needs.

### 1.2 Green-flag surfacing
**Effort:** S · **Deps:** Phase 0

Symmetric counterpart to the existing Red Flag Radar. Same model, opposite signal. Detect specific *healthy* patterns (pacing matches hers, soft "no" landed without sulking, consistent details over time, willingness to video chat, public-venue suggestions, named friends/family with continuity).

**Why now:** cheap (mostly prompt work + small schema addition), and removes a real bias from the product. HeyTelli currently only knows how to see what's wrong. The survivor/DV literature is clear: knowing what "fine" looks like is half the literacy.

### 1.3 Cross-match pattern detector
**Effort:** L · **Deps:** Phase 0, 1.1 (claim ledger)

The single biggest feature in the synthesis. Detect repeated *language patterns, escalation arcs, and timing* across the user's own match history. *"This is the third time a match used 'I've never felt this with anyone' within 4 days — same arc as Mike, Jake, Ryan."*

Pure clarity, never a verdict on him. **No category leader exists** — the existence of "dating spreadsheet" products (Notion templates, Google Sheets routines, the *Spread* app on iOS) tells you the job is real and under-served.

**Failure mode to engineer for:** the "I've seen this before" moment is emotionally high-stakes; false positives erode trust fast. Show evidence (the actual past quotes), not conclusions.

---

## Phase 2 — VET upgrade

Goal: stop being silent on "is this person real." Addresses the highest-prevalence pre-date concerns (catfishing, AI photos, off-app scam pressure) without taking on Garbo-shaped background-check liability.

### 2.4 Reverse-image + AI-photo scan on import
**Effort:** M · **Deps:** none

On screenshot import, detect face(s), run reverse image search (PimEyes / FaceCheck.ID or comparable), and run an AI-generation classifier (Hive, Optic). Surface results as *links to investigate*, never as verdicts. *"This face appears on 3 other profiles."* / *"This photo has AI-generation artifacts."*

**Implementation notes:**
- Gate behind user-initiated tap (cost per scan is real)
- Cache results per face-vector so re-scans within a match are free
- Combat for AI-generated photos that defeat classic reverse search

**Why now:** standalone (no schema deps), single biggest VET psychological lift. Tech landscape is mature.

### 2.5 Off-app pressure detector
**Effort:** S · **Deps:** none

Analyze transcripts for signals to move the conversation to WhatsApp / Telegram / Signal / phone. Surface as informational: *"He suggested moving to WhatsApp on day 2 — earlier than 85% of conversations you've imported."*

**Why now:** pure prompt + transcript work, no new infrastructure. Tiny effort, real clarity signal. Directly addresses the FBI IC3 / FTC romance-scam pattern.

### 2.6 Light identity cross-check
**Effort:** S–M · **Deps:** none

**Not** a background check. Light signals only:
- Phone-number format/region matches claimed location
- Employer name validity (does the company exist? — Crunchbase / OpenCorporates / domain WHOIS)
- Public-presence yes/no signals (GitHub for tech matches, public personal site at claimed domain, etc.)

All surfaced as questions, not verdicts. Fills the VET gap without taking on the FCRA-restricted, stalker-coded burden of a real background-check product.

### 2.7 Vet Packet — user-facing assembly
**Effort:** S · **Deps:** 1.1 (claim ledger), 2.4, 2.5, 2.6

The moment the VET phase becomes coherent UX. A single "test what he told you" surface that pulls the underlying VET signals together and auto-generates **one-tap deep-link searches** from the Story Check claim ledger.

For each first-person claim he's made (employer, role, hometown, sister's school, dog's name, etc.), Vet Packet generates the search she'd run herself:

- `linkedin.com/search/results/people/?keywords=Mike+Smith+Stripe`
- `google.com/search?q=Mike+Smith+site:linkedin.com+Stripe`
- `instagram.com/explore/tags/...` / direct profile URL when a handle is known
- Employer careers / about page (does the company exist? is the role plausible?)
- NSOPW search prefilled with claimed first name + state

Plus the **auto-run** results from 2.4 (reverse image + AI-photo verdicts per face) and the **observations** from 2.5 (off-app pressure timing).

**She investigates each link directly.** HeyTelli stores only her observations ("looked her up, all checks out" / "name didn't match LinkedIn"), never his data. No dossier, no cross-user claims, no FCRA exposure.

**Why this shape (and not full automation):**
- **LinkedIn TOS** prohibits automated lookup; programmatic LinkedIn search is a non-starter regardless of clever scraping.
- **She seeing the evidence directly is more trustable** than HeyTelli summarizing someone's identity.
- **PRD-aligned:** *equip the user, never make claims about the match.* Generating search URLs ≠ claims.
- **Falls naturally out of the claim ledger** — every Story Check `key` maps to a search template.

**API budget:** roughly $0.05–0.20 per match across PimEyes / Hive / Brave-or-Google Search / Crunchbase, depending on enabled checks. Cacheable per face vector.

---

## Phase 3 — Safe Date Flow primitives

Goal: fill in the missing pieces of the Safe Date Flow already specced in [`upcoming_features.md`](../upcoming_features.md). These are mostly small, ship-fast iOS plumbing. **Refer to `upcoming_features.md` for step-by-step UX detail; this section adds the missing safety primitives.**

### 3.7 Auto-generated evidence packet
**Effort:** S · **Deps:** existing Date Card data

One-tap "send my person the packet" → opens `MFMessageComposeViewController` pre-filled with: profile photo (downscaled), first name + last initial, app she met him on, venue, time, ETA home, "if I don't text by X, call me." She taps Send.

Different from the Date Card: Date Card is a structured shareable safety object; this is the *informational handoff text* women rewrite every single date.

**Why now:** almost no engineering — Date Card data already exists; this is a different surface for it.

### 3.8 Apple Check In deep-link prompt
**Effort:** S · **Deps:** none

When Date Mode activates, surface *"Start Check In with [trusted contact] — timer for [expected end]"* with a button that deep-links into iOS Messages → Check In with the timer prefilled.

**Why now:** iOS already gives this primitive away for free, and almost no dating app wraps it. The win is the right prompt at the right moment.

### 3.9 Code-word builder + trigger
**Effort:** S–M · **Deps:** trusted contact data

Set-once flow: she picks a phrase, picks the person, picks the action they should take. Saves the agreement on her phone *and previews exactly what the friend will see* so consent is mutual. Trigger via share extension or Apple Watch complication during the date — sends the agreed message to the agreed person.

**Why now:** Date Card already supports a code-word field; this turns it into a primitive with both-ends consent baked in.

### 3.10 Drink-spiking awareness card
**Effort:** S · **Deps:** none

Short content card inside Date Mode: signs of spiking, what to do, products that help. Surfaced once at the right moment (start of Date Mode at a bar/restaurant venue), then sleeps.

**Why now:** content-only, tiny effort. Partner with a DV org (RAINN, NDVH) for the copy.

### 3.11 Ask for Angela / Angel Shot reference card
**Effort:** S · **Deps:** none

Reference card inside Date Mode showing the Angel Shot codes (*neat* = walk me to my car · *on the rocks* = call me a cab · *with lime* = call police) and the Ask for Angela phrase.

**Aspirational follow-up:** crowd-sourced or partner-sourced map of venues that train staff on the codes. Skip the map for v1.

---

## Phase 4 — Date Mode advanced

Goal: elevate Date Mode from "checklist" to "she has my back if it goes wrong." Build only after Phase 3 ships and is loved. **All three correspond to Safe Date Flow Step 6 (Quick Actions) in `upcoming_features.md`.**

### 4.12 Pre-staged rescue call (CallKit)
**Effort:** M · **Deps:** 3.9, Date Mode infra

CallKit "incoming call" UI scheduled for T+45 min by default, or one-tap trigger any time during the date. Looks like a real call screen so she can excuse herself.

**Why now:** real platform work (CallKit + audio session management). Worth doing right; not worth doing before Phase 3.

### 4.13 Auto-escalating check-in
**Effort:** M · **Deps:** trusted contact data + scheduling

*"If I don't tap I'm home by 11:30pm, send my person the escalation message plus my last known location."* Composes the structured fallback women already build manually with their friends.

**Why now:** the *promise* of this is what makes Date Mode feel real. Requires careful UX — false escalations are worse than no feature. Needs Phase 3 in place to have content to escalate with.

### 4.14 Panic button / SOS
**Effort:** M · **Deps:** 4.12, 4.13

The composite apex: one tap → triggers rescue call (4.12) + auto-escalating check-in immediately fires (4.13) + Apple Check In ends + trusted person gets the full escalation message + last location.

**Why last:** SOS that lacks the primitives underneath is theater. (Per EFF: of 231 Tinder users who reported sexual offenses, 11 received a personalized response.) Build the primitives first; SOS is the assembly.

---

## Deferred — revisit, don't schedule

### D.1 Public-record / background-check lookup (NSOPW, criminal, marriage records)

**Defer.** FCRA-restricted, expensive APIs, marginal value over the lighter checks in 2.6, and Garbo's 2024 wind-down shows there isn't a clean B2B partner. Revisit only if a credible partner emerges that fits the PRD.

### D.2 Crowd-sourced Angel Shot venue map

**Defer.** Real value depends on coverage, which depends on data acquisition that's hard to bootstrap. Revisit after 3.11 sees real use, or if a DV-org partner can supply venue lists.

---

## Explicit non-goals — never build

State these publicly on the landing page. They are the differentiator.

### N.1 AWDTSG-style crowd vetting / Tea-style whisper network inside HeyTelli
PRD ban, Tea breach (72K verification IDs + 1M+ DMs leaked to 4chan, July 2025), AWDTSG defamation litigation ongoing. Demand is loud; building it is existential risk.

### N.2 "Safe" / "unsafe" / "verified-good" labels on people
Same PRD reason the score schema is leaving. HeyTelli helps the user understand her own situation; it never makes claims about another person.

### N.3 Anything that auto-sends safety content on her behalf without her hand on the button
Friend-text, location share, code-word trigger — all stay one-tap-by-her. Automating *those* would feel like surveillance even if it's "for her benefit."

### N.4 Verification flows that require the match to be a HeyTelli user
The user is the woman. The match is not a user and does not become one.

### N.5 Hosted shared dossiers, friend accounts, public profiles of matches
PRD-foundational.

---

## Summary

| Phase | Includes | Shippable value | Effort |
|---|---|---|---|
| **0. Foundation** | 0.1 schema deprecation | Unblocks everything | S–M |
| **1. REMEMBER** | 1.1 Story Check, 1.2 Green flags, 1.3 Cross-match | "Smartest friend who remembers everything" | M + S + L |
| **2. VET** | 2.4 Reverse-image, 2.5 Off-app detector, 2.6 Light identity, 2.7 Vet Packet | "We actually checked he's real" | M + S + S + S |
| **3. Safe Date Flow primitives** | 3.7 Evidence packet, 3.8 Check In prompt, 3.9 Code word, 3.10 Drink awareness, 3.11 Angel Shot ref | Date Mode goes from a screen to a kit | 5× S |
| **4. Date Mode advanced** | 4.12 Rescue call, 4.13 Auto-escalating check-in, 4.14 SOS | "She isn't alone if it goes wrong" | 3× M |

## Build sequence

`0.1` → `1.1` → `1.2` → `2.4` → `2.5` → `3.7` → `3.8` → `1.3` → `2.6` → `2.7` → `3.9` → `3.10` → `3.11` → `4.12` → `4.13` → `4.14`

The mid-sequence return to `1.3` (cross-match detector) is intentional: it benefits from having a few VET signals (`2.4`, `2.5`) and the foundational REMEMBER pieces (`1.1`, `1.2`) to incorporate, but it doesn't block the smaller Phase 3 wins from shipping in parallel. `2.7` follows `2.6` because Vet Packet is the *assembly* of the VET signals — it only earns its keep once `2.4`, `2.5`, and `2.6` exist. Phase 3 primitives are independently shippable in any order once started.

## Source of the priorities

The phase ordering is derived from a structured research synthesis covering:

- Reddit / women-authored crowdsourced threads on dating safety
- Pre-date concerns: FBI IC3 ($672M romance scams 2024), FTC, Pew (56% of women under 50 received unsolicited explicit content), Gen Digital 2025 (52% catfish encounter rate, 53% AI photo encounter rate)
- On-date concerns: RAINN, second-location rule (Grace Millane case as canonical), drink spiking, transportation
- The existing dating-safety landscape: Tinder Face Check, Bumble Deception Detector + Private Detector, Hinge Selfie Verification + Hidden Words, the Garbo wind-down (2024), Tea breach (2025)
- The lived repertoire: dating spreadsheets as a product category, AWDTSG groups, Ask for Angela / Angel Shot, the "tell my friend where I'll be" text women rewrite each date
- Pattern-recognition canon: Bancroft (*Why Does He Do That?*), Stark (*Coercive Control*), Hill (*See What You Made Me Do*), OneLove / NDVH / Loveisrespect green-flag guidance

Full source citations live in the research transcripts; pull them into per-feature specs as those specs get written.
