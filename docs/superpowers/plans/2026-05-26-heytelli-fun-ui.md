# HeyTelli Fun UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe the HeyTelli Expo app into a warmer best-friend safety companion without removing existing dating safety functionality.

**Architecture:** Keep backend/API behavior unchanged and reshape the mobile app around derived presentation models. Add home brief/trend helpers in `lib/home-match-card.ts`, update static regression tests, then restyle and reorder the Home, Match Detail, and Settings screens around Read, Story, Date, Talk, and My dating OS.

**Tech Stack:** Expo Router, React Native, TypeScript, node:test, pnpm, existing HeyTelli API client.

---

### Task 1: Home Brief Model

**Files:**

- Modify: `artifacts/bumble-mobile/lib/home-match-card.ts`
- Modify: `artifacts/bumble-mobile/lib/home-match-card.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests for `getHomeDailyBriefModel` and `getHomeTrendSnapshot`:

```ts
test("builds a best-friend daily brief from active matches", () => {
  const brief = getHomeDailyBriefModel(
    [
      {
        ...baseMatch,
        name: "Maya Rose",
        nextDateAt: "2026-05-24T20:00:00.000Z",
      },
      {
        ...baseMatch,
        name: "Gretchen Lane",
        pendingScreenshotCount: 2,
        analysisFreshness: "needs-analysis",
        lastRead: {
          body: "Saved read stays visible.",
          generatedAt: "2026-05-26T12:00:00.000Z",
          screenshotCountAt: 2,
        },
        readFreshness: "stale",
      },
    ],
    new Date("2026-05-23T13:00:00.000Z"),
  );

  assert.equal(brief.headline, "Telli noticed...");
  assert.equal(brief.items[0]?.matchName, "Gretchen");
  assert.match(brief.items[0]?.body ?? "", /screenshots waiting/i);
  assert.match(brief.items.map((item) => item.body).join(" "), /Date Card/i);
});

test("summarizes trends without exposing old score labels", () => {
  const trend = getHomeTrendSnapshot([
    {
      ...baseMatch,
      tags: ["slow planner"],
      redFlagSummary: {
        currentCount: 0,
        historicalCount: 1,
        highSeverityCount: 0,
        lastAnalyzedAt: "2026-05-26T12:00:00.000Z",
      },
    },
  ]);

  assert.equal(trend.title, "Pattern watch");
  assert.doesNotMatch(trend.body, /Sex|Conv|Chem/);
  assert.match(trend.body, /slow planner|saved pattern/i);
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run:

```bash
node --experimental-strip-types --test artifacts/bumble-mobile/lib/home-match-card.test.ts
```

Expected: fails because the new helpers are not exported.

- [ ] **Step 3: Implement helpers**

Export small, deterministic helpers:

```ts
export type HomeBriefItem = {
  matchName: string;
  title: string;
  body: string;
  tone: HomeSignalTone;
  actionKind: HomePrimaryActionKind;
};

export type HomeDailyBriefModel = {
  headline: "Telli noticed...";
  body: string;
  items: HomeBriefItem[];
};

export type HomeTrendSnapshot = {
  title: string;
  body: string;
  tone: HomeSignalTone;
};
```

Build brief items from `getHomeMatchCardModel`, sort by `attentionRank`, and cap at three items. Build trend copy from tags, red flag summaries, upcoming dates, and screenshot freshness.

- [ ] **Step 4: Run GREEN**

Run:

```bash
node --experimental-strip-types --test artifacts/bumble-mobile/lib/home-match-card.test.ts
```

Expected: pass.

### Task 2: Visual Tokens And Home

**Files:**

- Modify: `artifacts/bumble-mobile/constants/colors.ts`
- Modify: `artifacts/bumble-mobile/app/index.tsx`
- Modify: `artifacts/bumble-mobile/lib/mobile-copy-regression.test.ts`

- [ ] **Step 1: Write failing static copy test**

Assert the app source includes "Telli noticed..." and the new "My dating OS" naming:

```ts
assert.match(combined, /Telli noticed/);
assert.match(combined, /My dating OS/);
```

- [ ] **Step 2: Run tests and confirm RED**

Run:

```bash
node --experimental-strip-types --test artifacts/bumble-mobile/lib/mobile-copy-regression.test.ts
```

Expected: fails until the app copy is updated.

- [ ] **Step 3: Update UI**

Change `colors.ts` to a balanced blush/lilac/teal palette with accessible text. On Home, import `getHomeDailyBriefModel` and `getHomeTrendSnapshot`, replace the metric-first dashboard header with:

- "Telli noticed..." brief card.
- Three small priority rows.
- A pattern snapshot.
- Existing ShareSheet onboarding, auto archive, stale nudges, filters, tags, sorting, and match rows.

Keep `FlatList`, pull-to-refresh, filters, and navigation behavior intact.

- [ ] **Step 4: Run GREEN**

Run:

```bash
node --experimental-strip-types --test artifacts/bumble-mobile/lib/mobile-copy-regression.test.ts artifacts/bumble-mobile/lib/home-match-card.test.ts
```

Expected: pass.

### Task 3: Match Story, Date, And Talk Reframe

**Files:**

- Modify: `artifacts/bumble-mobile/lib/match-detail-hero.ts`
- Modify: `artifacts/bumble-mobile/lib/match-detail-hero.test.ts`
- Modify: `artifacts/bumble-mobile/app/match/[id].tsx`

- [ ] **Step 1: Write failing hero test**

Add a test asserting warmer wording:

```ts
assert.match(model.body, /Telli will keep the last read visible/i);
```

- [ ] **Step 2: Run tests and confirm RED**

Run:

```bash
node --experimental-strip-types --test artifacts/bumble-mobile/lib/match-detail-hero.test.ts
```

Expected: fails until copy is updated.

- [ ] **Step 3: Update match detail UI**

Keep all existing cards and behaviors. Add lightweight section headers for "Read", "Story", "Date", and "Talk". Add a `StoryOverviewCard` near the top with:

- latest trend line from existing tags/red flag summary/date history/timeline.
- timeline count and last event.
- analysis freshness status.

Move the existing timeline into the Story group. Keep screenshots/transcript/tags/notes lower on the page under receipts/private memory. Make the Date Card feel like concierge steps by adding friendlier section copy and preserving Date Card templates, safe-date walkthrough, and circle checks.

- [ ] **Step 4: Run GREEN**

Run:

```bash
node --experimental-strip-types --test artifacts/bumble-mobile/lib/match-detail-hero.test.ts artifacts/bumble-mobile/lib/mobile-copy-regression.test.ts
```

Expected: pass.

### Task 4: Settings Reframe

**Files:**

- Modify: `artifacts/bumble-mobile/app/settings.tsx`
- Modify: `artifacts/bumble-mobile/lib/mobile-copy-regression.test.ts`

- [ ] **Step 1: Confirm copy test covers Settings**

Use the Task 2 static test for "My dating OS".

- [ ] **Step 2: Update Settings UI**

Retitle Settings to "My dating OS". Keep profile screenshot upload/analyze, trusted circle, and date defaults. Add three compact top summary tiles for Profile, Circle, and Date Defaults. Keep contact picking explicit and local-first.

- [ ] **Step 3: Run tests**

Run:

```bash
node --experimental-strip-types --test artifacts/bumble-mobile/lib/mobile-copy-regression.test.ts artifacts/bumble-mobile/lib/settings-ui.test.ts artifacts/bumble-mobile/lib/user-settings.test.ts
```

Expected: pass.

### Task 5: Full Verification And Device Refresh

**Files:**

- No source edits unless verification finds issues.

- [ ] **Step 1: Run focused mobile tests**

Run:

```bash
node --experimental-strip-types --test artifacts/bumble-mobile/lib/settings-ui.test.ts artifacts/bumble-mobile/lib/user-settings.test.ts artifacts/bumble-mobile/lib/date-safety-plan.test.ts artifacts/bumble-mobile/lib/date-plan-templates.test.ts artifacts/bumble-mobile/lib/profile-analysis-batches.test.ts artifacts/bumble-mobile/lib/safety-action-checklist.test.ts artifacts/bumble-mobile/lib/home-match-card.test.ts artifacts/bumble-mobile/lib/match-detail-hero.test.ts artifacts/bumble-mobile/lib/mobile-copy-regression.test.ts
```

Expected: pass.

- [ ] **Step 2: Run typecheck and formatting**

Run:

```bash
pnpm -w run typecheck
pnpm exec prettier --check .gitignore docs/superpowers/specs/2026-05-26-heytelli-fun-ui-design.md docs/superpowers/plans/2026-05-26-heytelli-fun-ui.md artifacts/bumble-mobile/constants/colors.ts artifacts/bumble-mobile/app/index.tsx artifacts/bumble-mobile/app/match/[id].tsx artifacts/bumble-mobile/app/settings.tsx artifacts/bumble-mobile/lib/home-match-card.ts artifacts/bumble-mobile/lib/home-match-card.test.ts artifacts/bumble-mobile/lib/match-detail-hero.ts artifacts/bumble-mobile/lib/match-detail-hero.test.ts artifacts/bumble-mobile/lib/mobile-copy-regression.test.ts
git diff --check
```

Expected: pass.

- [ ] **Step 3: Refresh PyPhone**

Run Metro bundle fetch and launch the dev client against the LAN URL already used for this repo:

```bash
ROUTER_LINK=$(readlink artifacts/bumble-mobile/node_modules/expo-router)
ROUTER_PATH="${ROUTER_LINK#../../../}/entry.bundle"
curl -f --max-time 180 "http://localhost:8081/${ROUTER_PATH}?platform=ios&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.routerRoot=app&unstable_transformProfile=hermes-stable" -o /tmp/heytelli-fun-ui-ios.bundle
xcrun devicectl device process launch --device PyPhone --terminate-existing --payload-url 'ai.joewilson.heytelli://expo-development-client/?url=http%3A%2F%2F192.168.1.66%3A8081' ai.joewilson.heytelli
```

Expected: bundle fetch succeeds and PyPhone launches the dev client.
