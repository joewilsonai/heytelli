# Calm Read Match Detail Design

## Goal

Make `The Calm Read` the primary top card on the HeyTelli match detail screen. The first screen should give emotional relief and a clear next move before asking the user to inspect deeper evidence.

This replaces the current `Latest Read` presentation as the hero experience, while preserving the old read text as supporting context inside the Calm Read or an expandable detail.

## Product Principle

HeyTelli should judge patterns, not people.

The match detail screen should not feel like a danger dashboard or dating CRM. It should feel like a private dating flight recorder: receipts in, calm interpretation out, with trusted-circle sharing when the user wants another human read.

Core promise:

> Private pattern memory for dating, so your gut has receipts.

## Recommended Hierarchy

1. `The Calm Read` top card
   - Short grounded summary.
   - Clear safety classification: `This is not a safety concern`, `This may be a boundary concern`, or `This needs safety support`.
   - Best next move.
   - Analysis freshness state when relevant.
2. Three lenses underneath
   - `Safety Risk`
   - `Dating Clarity`
   - `Emotional Pace`
3. Evidence and receipts
   - Active patterns.
   - Historical, resolved, contradicted, or escalating patterns.
   - Tappable evidence with `Evidence`, `Why it matters`, `What to do next`, and `Source`.
4. Gut Check / Trusted Circle share
   - Circle-ready summary.
   - Date Plan Share.
   - Post-Date Debrief share later.

## Three Lenses

### Safety Risk

Safety Risk is serious and should stay calm. It is not a numeric score and should not be presented as a verdict about the match.

Values:

- `Low`: no coercion, threats, money pressure, stalking, privacy pressure, sexual pressure, or boundary violation detected.
- `Moderate`: a boundary or logistics concern exists; slow down, verify, or share with circle.
- `Elevated`: strong safety signal exists; foreground protective actions and resources.

Serious safety UI, including Hotline, RAINN, block/report, scam, or image-abuse resources, should appear only for `Moderate` or `Elevated` cases with matching evidence categories. A normal ambiguity case should keep those resources in a persistent Safety Resources drawer, not the main match flow.

### Dating Clarity

Dating Clarity covers ordinary dating ambiguity: soft availability, vague plans, cooling after a date, low reciprocity, missed follow-through, mixed signals, or planning friction.

Values:

- `Clear`: interest and follow-through are aligned.
- `Mixed`: warmth exists, but next steps are not concrete.
- `Unclear`: evidence is too thin or contradictory to interpret confidently.
- `Cooling`: recent evidence shows lower effort or less concrete follow-through.

This lens should power the best next move in low-safety-risk situations.

### Emotional Pace

Emotional Pace helps the user notice intensity and her own nervous system without blaming either person.

Values:

- `Normal`: pace matches the relationship stage.
- `Moderate`: vulnerability or intensity is present but not clearly concerning.
- `Fast`: intimacy, disclosure, attachment, or pressure is moving faster than evidence supports.
- `Unbalanced`: one person is carrying much more emotional energy than the other.

This lens supports two lanes: `Their Signals` and `My Pacing`.

## Pattern Categories And States

Every pattern should have a category:

- `Safety risk`
- `Dating clarity`
- `Emotional pacing`
- `Logistics`
- `Communication`
- `Reciprocity`
- `Green signal`

Every pattern should also have a state:

- `Active`: still visible in the latest evidence.
- `Partially resolved`: later behavior softened or answered the concern.
- `Resolved`: later behavior directly addressed the concern.
- `Historical`: useful memory, but no longer visually hot.
- `Escalating`: repeated or intensifying.
- `Contradicted by newer behavior`: newer evidence points the other way.

Example: if an earlier pattern was `Ignored direct meetup ask`, but the person later planned, showed up, and completed the date, that pattern should move to `Partially resolved` or `Contradicted by newer behavior`. It should not remain visually hot beside current concerns.

## Calm Read Card Content

The top card should include:

- Label: `The Calm Read`
- Headline: one sentence, plainspoken.
- Summary: two to four sentences grounded in evidence.
- Safety classification: a sentence, not a badge-only score.
- Best next move: one or two action sentences.
- Freshness: `Up to date`, `New screenshots waiting`, or `Refresh recommended`.

Example for the Gretchen calibration case:

> Warm signs exist. Momentum is not confirmed.
>
> This match shows real warmth and follow-through. She planned, showed up, bantered, stayed engaged, and responded warmly after the date. The only current caution is post-date uncertainty: she gave specific scheduling reasons but did not offer a firm alternative.
>
> This is not a safety concern. It is a dating clarity moment.
>
> Best next move: reply once warmly. Do not chase. Watch whether she reopens casual conversation or follows up when her schedule clears.

## Evidence Detail Contract

Every pattern card should be tappable and open the same structure:

- Pattern title.
- Category.
- State.
- Evidence.
- Why it matters.
- What to do next.
- Source label.

Source labels:

- `AI suggested`
- `User confirmed`
- `User note`
- `Circle note`
- `From conversation`
- `From date debrief`
- `From profile`

This protects trust. Sensitive or interpretive observations should never appear as unqualified truth.

## Trusted Circle Role

Gut Check becomes the human layer under the Calm Read.

The match detail screen should make it easy to share a clean private summary with trusted people without exposing screenshots by default.

Circle modes:

- `Gut Check Share`: confusion before replying or continuing.
- `Date Plan Share`: logistics, check-ins, expected end time, transport, location changes.
- `Post-Date Debrief`: optional summary of what happened, what felt good, what felt off, and what the user wants to remember.

Phase 1 should keep Circle simple: no friend accounts, no public pages, no searchable profiles, no hosted screenshots, no public labels about non-users.

## Approaches Considered

### A. Calm Read First

Recommended. The user sees the emotional interpretation and next move first, then can inspect lenses and evidence. This matches the actual usage moment: she is often activated and needs clarity before detail.

### B. Lenses First

Clear and structured, but more dashboard-like. It risks making the app feel clinical before it feels helpful.

### C. Timeline First

Receipts-first is trustworthy, but too slow when the user wants to know what to do next.

## Data And API Implications

Prefer deriving the first implementation from existing data:

- `overallRead`
- `analysisFreshness`
- `redFlags`, `currentRedFlags`, `historicalRedFlags`, and `greenFlags`
- `redFlagSummary`
- `timelineEvents`
- `tags` and `vibeTags`
- `nextDateAt`, `nextDateLocation`, and date safety plan fields

Backend changes may be needed later to persist explicit lens values, next moves, pattern categories, and pattern states. The first UI pass can use deterministic client helpers plus existing analysis output where available.

The AI prompt should be calibrated away from broad `red flag` language for non-safety patterns. It should separate:

- safety risk,
- dating clarity,
- emotional pacing,
- green signals,
- best next move.

## Testing

Add focused tests around the model layer before changing UI:

- A low-risk ambiguity case returns `Safety Risk: Low`, `Dating Clarity: Mixed`, and a non-alarmist next move.
- Safety resources are not foregrounded unless safety evidence crosses the configured threshold.
- A pattern contradicted by newer behavior does not appear as an active hot concern.
- The Calm Read preserves stale saved read content while clearly marking `New screenshots waiting` or `Refresh recommended`.
- Gut Check share summaries do not include screenshots, transcripts, phone numbers, or photos by default.

## Scope Boundaries

This pass does not create friend accounts, public match pages, a people database, or a hosted accusation surface.

This pass does not remove existing safety controls. It changes when they are foregrounded.

This pass does not require storing screenshots on the backend. Existing screenshot minimization and local-copy principles remain intact.
