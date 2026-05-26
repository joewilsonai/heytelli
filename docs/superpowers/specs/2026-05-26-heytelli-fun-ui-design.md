# HeyTelli Fun UI Design

## Goal

Make HeyTelli feel like a warm, iPhone-first dating safety companion while preserving the current functional depth: screenshot intake, reads, stale analysis, red flags, tags, trends, timeline, date planning, Date Cards, circle checks, chat, voice debriefs, profile review, and deletion controls.

## Product Direction

The app should stop reading as an admin console. The first question on every screen is: what would a smart best friend help with right now?

Home becomes a daily brief. It should lead with "Telli noticed..." and a small priority queue of what needs attention today: screenshots waiting, stale reads, upcoming dates, missing Date Cards, circle checks, or quiet-but-promising matches.

Match detail becomes a story surface. It should answer "what is going on with this person?" before exposing tools. The page keeps all current features, but groups them into friendly moments:

- Read: latest read, freshness, saved patterns, immediate next step.
- Story: trends, tags, timeline, screenshots, transcript, notes.
- Date: scheduling, Date Card templates, safe-date walkthrough, circle checks, date brief, post-date debrief.
- Talk: chat with HeyTelli, voice debrief, voice note check, reply prep.

Settings becomes "My dating OS": profile review, trusted circle, and date defaults. Existing storage/privacy behavior remains unchanged.

## Visual System

Move away from the heavy orange/brown operational palette. Use a soft but not childish palette: blush as primary, lilac as secondary, clean off-white backgrounds, blue/teal informational accents, and high-contrast text. Cards should be flatter and calmer, with small expressive accents and clear icons. Avoid one-note gradients, bokeh/orb decoration, or marketing-style hero layouts.

## Data And Behavior

No backend contract changes are required for this pass. The UI should reuse existing match fields and helper models. A small model helper can summarize the home daily brief from the existing `getHomeMatchCardModel` output. Match trend copy can be derived from existing scores, tags, red flag summary, date history, transcript, and timeline events.

The app must continue to show saved reads when they are stale. Stale analysis should be communicated as "new screenshots waiting" or "refresh recommended" without hiding the last saved read.

## Testing

Add or update model/static tests before production edits:

- Home model returns a daily brief headed by "Telli noticed..." with prioritized action items.
- Home model includes a trend snapshot that does not expose old Sex/Conv/Chem labels.
- Match detail hero uses warmer best-friend language for stale screenshots and Date Cards.
- Mobile copy includes the new Story/Date/Talk framing and avoids old Bumble/Haystack/Wingman/Grok language.

## Scope Boundaries

This pass is a product/UI reframe, not a full navigation rewrite. Keep behavior stable. Do not store screenshots in the backend. Do not add hosted web sharing. Do not remove any existing safety or admin controls; make them feel less dominant.
