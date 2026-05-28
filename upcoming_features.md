# HeyTelli Upcoming Features

This is the near-term product roadmap for turning HeyTelli from a useful beta into a clear, repeatable safety-and-clarity loop for women dating online.

## 1. Safe Date Flow

**Goal:** When a user enters a date, HeyTelli should automatically guide her from "I have plans" to "I am prepared, my circle knows, and I can debrief after."

### Trigger

- Starts when a match gets `nextDateAt`, `nextDateLocation`, or a date plan template.
- Shows a clear prompt on the match screen and home dashboard:
  - "Date coming up. Get your Date Card ready."

### Step 1: Date Details

- Confirm match first name.
- Confirm date time.
- Confirm location.
- Choose or edit a date plan template:
  - Coffee
  - Drinks
  - Dinner
  - Custom
- Optional outfit or note.

### Step 2: Match Review

- Show latest read.
- Show whether analysis is up to date or stale.
- Show top green flags.
- Show current concerns.
- Show relevant profile/context notes.
- If screenshots were uploaded after the latest analysis, prompt to reanalyze before creating the Date Card.

### Step 3: Circle Setup

- Let the user choose up to 3 trusted circle people.
- Pull from saved circle defaults or contacts picker.
- Store only safe labels/first names in app data where possible.
- Make clear that no screenshots or private conversation images are shared with the circle.

### Step 4: Date Card

- Generate a clean shareable Date Card message/image with:
  - Match first name only
  - Date location
  - Date time
  - Check-in time
  - Expected end time
  - Transport/exit plan
  - Optional code word
  - Optional user note
- Do not include profile photos.
- Do not include screenshots.
- Do not create a hosted public web page.

### Step 5: Date Mode

- Let the user mark herself as "on date."
- Turn on cover mode per date.
- Cover mode can look like:
  - Clock
  - Notes
  - Breathing screen
- Long press opens a harmless-looking action screen.

### Step 6: Quick Actions

- Provide large, fast actions:
  - "I'm okay"
  - "Call me"
  - "Need an exit"
  - "Home safe"
- Actions should generate shareable messages for the selected circle.
- Messages should be calm, clear, and not expose private screenshots.

### Step 7: After-Date Debrief

- When the date ends or becomes past due, prompt for a debrief.
- Support voice and text.
- Save:
  - Full transcript
  - Timeline event
  - Tags
  - Green flags
  - Red flags/concerns
  - What went well
  - What felt off
  - Next move suggestion
- Mark the date as debriefed once complete.

### Success Criteria

- A beta tester can enter a date and understand exactly what to do next.
- A tester can share a Date Card with a trusted person in under 60 seconds.
- A tester can turn on Date Mode without hunting through settings.
- The app preserves the post-date memory in the timeline.

## 2. First-Run Onboarding

**Goal:** Make the first session obvious.

### Flow

- Welcome screen with one clear promise:
  - "Import a dating screenshot. HeyTelli turns it into a private read, patterns, and safer next steps."
- First task: import a profile or chat screenshot.
- Explain the core loop:
  - Import screenshots
  - Get a read
  - Track patterns
  - Plan dates safely
  - Debrief after
- Show privacy basics:
  - Raw screenshots are minimized after analysis where possible.
  - Circle shares do not include screenshots.
  - The app is private by default.

### Success Criteria

- New testers know where to start.
- New testers understand screenshot sharing into HeyTelli.
- New testers understand the difference between Read, Story, Date, and Talk.

## 3. Match Memory and Timeline Upgrade

**Goal:** Make HeyTelli feel like a private dating brain that remembers what changed.

### Features

- Timeline groups:
  - Screenshots analyzed
  - Date scheduled
  - Date Card shared
  - Date Mode started
  - Check-in sent
  - Voice/text debrief
  - Green flag seen
  - Concern seen
  - Tag added/removed
- "What changed since last time" summary.
- Trend analysis over time:
  - More consistent
  - More distant
  - More emotionally open
  - Planning energy rising/falling
  - Concerns repeating
- Durable green flags and red flags should remain visible even if not present in the newest analysis.
- Timeline should link back to transcript/read/debrief where appropriate.

### Success Criteria

- A user can understand the history of a match without rereading screenshots.
- Important emotional moments do not disappear after closing the match.
- Tags, patterns, reads, and debriefs all feel connected.

## 4. Dating Profile Compatibility

**Goal:** Use the user's own dating profile and stated preferences as context for match reads.

### Inputs

- Up to 10 dating profile screenshots.
- Optional typed profile text.
- Optional "what I want" notes.
- Optional dealbreakers and must-haves.

### Analysis

- Extract:
  - How she presents herself
  - Values she signals
  - Lifestyle cues
  - Relationship intent
  - Potential mismatch areas
  - Profile strengths
  - Profile blind spots
- Use this context when analyzing matches:
  - "This match aligns with what your profile says you want."
  - "This may be drifting from your stated standards."
  - "This looks exciting, but it does not match your listed dealbreakers."

### Success Criteria

- Match reads become more personal to the user.
- The app helps her stay anchored to her own standards.
- Profile analysis does not become judgmental or prescriptive.

## Product Priority

1. Safe Date Flow
2. First-Run Onboarding
3. Match Memory and Timeline Upgrade
4. Dating Profile Compatibility

Safe Date Flow comes first because it ties together the most differentiated parts of HeyTelli: date planning, circle sharing, cover mode, check-ins, timeline memory, and post-date debrief.
