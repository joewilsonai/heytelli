# Calm Read Match Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `The Calm Read` the primary top card on the match detail screen, with safety/clarity/pace lenses, a best next move, freshness, and evidence-first language.

**Architecture:** Add a deterministic `calm-read` model helper that derives copy and lens state from the existing `MatchDetail` shape. Add a focused `CalmReadCard` component that renders that model and preserves the latest saved read as supporting detail. Replace the current Today/Read hero+latest-read ordering with Calm Read first, leaving deeper evidence in `RedFlagsCard` and Gut Check below it.

**Tech Stack:** Expo React Native, TypeScript, Node `tsx --test`, existing `useColors`, existing `Card`/`Button`/`SectionLabel` primitives, generated API client types.

---

## File Structure

- Create `artifacts/bumble-mobile/lib/calm-read.ts`
  - Owns pure model derivation for Calm Read, lenses, freshness, and pattern state.
- Create `artifacts/bumble-mobile/lib/calm-read.test.ts`
  - Covers low-risk ambiguity, high-safety escalation, stale-read preservation, and resolved/historical pattern state.
- Create `artifacts/bumble-mobile/components/CalmReadCard.tsx`
  - Renders the Calm Read model and an expandable latest-read detail.
- Modify `artifacts/bumble-mobile/app/match/[id].tsx`
  - Import and render `CalmReadCard` as the primary top card in `Today` and `Read`.
  - Remove the redundant `NextStepCard` and `LatestReadCard` from those sections.
- Modify `artifacts/bumble-mobile/components/RedFlagsCard.tsx`
  - Rename the surface from alarm-coded `Pattern radar` to calmer `Evidence & receipts`.
  - Make the count badge neutral unless high-severity safety evidence exists.
- Modify `artifacts/bumble-mobile/lib/match-detail-surfacing.test.ts`
  - Static regression coverage that Calm Read is wired before Gut Check/RedFlags and that `LatestReadCard` is no longer rendered as the primary read surface.

---

### Task 1: Calm Read Model

**Files:**

- Create: `artifacts/bumble-mobile/lib/calm-read.ts`
- Test: `artifacts/bumble-mobile/lib/calm-read.test.ts`

- [ ] **Step 1: Write the failing model tests**

Create `artifacts/bumble-mobile/lib/calm-read.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { getCalmReadModel } from "./calm-read.ts";

const baseMatch = {
  id: 1,
  name: "Gretchen Moon",
  status: "active",
  vibeTags: [],
  tags: [],
  extractedProfile: {
    job: null,
    location: null,
    interests: [],
    mentionedTopics: [],
    conversationTone: null,
    scores: {
      sexPotential: { value: null, rationale: null },
      conversionAbility: { value: null, rationale: null },
      chemistry: { value: null, rationale: null },
    },
  },
  notes: "",
  nextDateAt: null,
  nextDateLocation: null,
  dateHistory: [],
  createdAt: "2026-05-20T00:00:00.000Z",
  updatedAt: "2026-05-20T00:00:00.000Z",
  lastDateBrief: null,
  dateBriefFreshness: "missing",
  dateSafetyPlan: null,
  lastRead: null,
  readFreshness: "missing",
  lastSpeaker: null,
  lastActivityAt: null,
  pendingScreenshotCount: 0,
  failedScreenshotCount: 0,
  analysisFreshness: "current",
  redFlags: [],
  currentRedFlags: [],
  historicalRedFlags: [],
  greenFlags: [],
  overallRead: "",
  redFlagSummary: {
    currentCount: 0,
    historicalCount: 0,
    highSeverityCount: 0,
    lastAnalyzedAt: null,
  },
  timelineEvents: [],
  screenshots: [],
  transcript: [],
};

test("calibrates a low-risk post-date ambiguity case without crisis language", () => {
  const model = getCalmReadModel({
    ...baseMatch,
    lastSpeaker: "her",
    dateHistory: [
      { when: "2026-05-28", location: "Louie", recap: "First date went well." },
    ],
    lastRead: {
      body: "Warm, reciprocal, and easygoing. Interested but noncommittal on timing.",
      generatedAt: "2026-05-29T12:00:00.000Z",
      screenshotCountAt: 4,
    },
    readFreshness: "current",
    overallRead:
      "Warm, reciprocal, and easygoing. Interested but noncommittal on timing.",
    greenFlags: [
      { label: "Warm follow-through", evidence: "She planned and showed up." },
    ],
    currentRedFlags: [
      {
        severity: "low",
        label: "Post-date soft availability",
        evidence: "Not sure about next weekend.",
        status: "current",
      },
    ],
  });

  assert.equal(model.label, "The Calm Read");
  assert.equal(model.safety.level, "Low");
  assert.equal(model.clarity.level, "Mixed");
  assert.equal(model.pace.level, "Moderate");
  assert.match(model.headline, /Momentum is not confirmed/i);
  assert.match(model.safety.sentence, /not a safety concern/i);
  assert.match(model.nextMove, /Reply once/i);
  assert.doesNotMatch(
    `${model.summary} ${model.nextMove}`,
    /hotline|RAINN|dangerous|unsafe/i,
  );
});

test("escalates strong safety evidence into elevated safety risk", () => {
  const model = getCalmReadModel({
    ...baseMatch,
    currentRedFlags: [
      {
        severity: "high",
        label: "Threats or intimidation",
        evidence:
          "Pattern detected: uses threats to influence what happens next.",
        status: "current",
      },
    ],
    redFlagSummary: {
      currentCount: 1,
      historicalCount: 0,
      highSeverityCount: 1,
      lastAnalyzedAt: "2026-05-29T12:00:00.000Z",
    },
  });

  assert.equal(model.safety.level, "Elevated");
  assert.match(model.safety.sentence, /safety support/i);
  assert.match(model.nextMove, /Share this with your circle/i);
});

test("keeps stale saved read visible while marking screenshots waiting", () => {
  const model = getCalmReadModel({
    ...baseMatch,
    pendingScreenshotCount: 2,
    analysisFreshness: "needs-analysis",
    readFreshness: "stale",
    lastRead: {
      body: "The saved read still matters.",
      generatedAt: "2026-05-29T12:00:00.000Z",
      screenshotCountAt: 3,
    },
  });

  assert.equal(model.freshness.label, "2 screenshots waiting");
  assert.match(model.summary, /saved read still matters/i);
  assert.match(model.nextMove, /Analyze the new screenshots/i);
});

test("marks old planning concerns as partially resolved after a completed date", () => {
  const model = getCalmReadModel({
    ...baseMatch,
    dateHistory: [
      { when: "2026-05-28", location: "Louie", recap: "Completed first date." },
    ],
    historicalRedFlags: [
      {
        severity: "low",
        label: "Ignored direct meetup ask",
        evidence: "Earlier plans were vague.",
        status: "previously-seen",
      },
    ],
  });

  assert.equal(model.patternStates[0]?.state, "Partially resolved");
  assert.match(
    model.patternStates[0]?.reason ?? "",
    /later planned or completed/i,
  );
});
```

- [ ] **Step 2: Run the model tests to verify they fail**

Run:

```bash
pnpm --dir scripts exec tsx --test ../artifacts/bumble-mobile/lib/calm-read.test.ts
```

Expected: FAIL because `./calm-read.ts` does not exist.

- [ ] **Step 3: Implement the Calm Read model helper**

Create `artifacts/bumble-mobile/lib/calm-read.ts`:

```ts
type RedFlagLike = {
  severity?: "low" | "medium" | "high" | string | null;
  label?: string | null;
  evidence?: string | null;
  status?: string | null;
};

type GreenFlagLike = {
  label?: string | null;
  evidence?: string | null;
};

export type CalmReadMatch = {
  name: string;
  lastRead?: {
    body: string;
    generatedAt: string;
    screenshotCountAt: number;
  } | null;
  readFreshness?: string | null;
  analysisFreshness?: string | null;
  pendingScreenshotCount?: number | null;
  failedScreenshotCount?: number | null;
  overallRead?: string | null;
  lastSpeaker?: "her" | "me" | string | null;
  nextDateAt?: string | Date | null;
  nextDateLocation?: string | null;
  dateHistory?: unknown[] | null;
  currentRedFlags?: RedFlagLike[] | null;
  historicalRedFlags?: RedFlagLike[] | null;
  redFlags?: RedFlagLike[] | null;
  greenFlags?: GreenFlagLike[] | null;
  redFlagSummary?: {
    currentCount: number;
    historicalCount: number;
    highSeverityCount: number;
    lastAnalyzedAt: string | null;
  } | null;
};

export type CalmReadLensTone =
  | "success"
  | "warning"
  | "danger"
  | "primary"
  | "muted";
export type CalmReadSafetyLevel = "Low" | "Moderate" | "Elevated";
export type CalmReadClarityLevel = "Clear" | "Mixed" | "Unclear" | "Cooling";
export type CalmReadPaceLevel = "Normal" | "Moderate" | "Fast" | "Unbalanced";
export type CalmReadPatternState =
  | "Active"
  | "Partially resolved"
  | "Resolved"
  | "Historical"
  | "Escalating"
  | "Contradicted by newer behavior";

export type CalmReadModel = {
  label: "The Calm Read";
  headline: string;
  summary: string;
  nextMove: string;
  safety: {
    level: CalmReadSafetyLevel;
    sentence: string;
    tone: CalmReadLensTone;
  };
  clarity: {
    level: CalmReadClarityLevel;
    sentence: string;
    tone: CalmReadLensTone;
  };
  pace: { level: CalmReadPaceLevel; sentence: string; tone: CalmReadLensTone };
  freshness: { label: string; tone: CalmReadLensTone };
  latestRead: { title: string; body: string; freshnessLabel: string } | null;
  patternStates: Array<{
    label: string;
    evidence: string;
    category:
      | "Safety risk"
      | "Dating clarity"
      | "Emotional pacing"
      | "Communication";
    state: CalmReadPatternState;
    reason: string;
  }>;
};

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function pendingCount(match: CalmReadMatch): number {
  return (
    (match.pendingScreenshotCount ?? 0) + (match.failedScreenshotCount ?? 0)
  );
}

function activeFlags(match: CalmReadMatch): RedFlagLike[] {
  return match.currentRedFlags?.length
    ? match.currentRedFlags
    : (match.redFlags ?? []);
}

function allFlags(match: CalmReadMatch): RedFlagLike[] {
  return [...activeFlags(match), ...(match.historicalRedFlags ?? [])];
}

function hasPattern(flags: RedFlagLike[], pattern: RegExp): boolean {
  return flags.some((flag) =>
    pattern.test(`${flag.label ?? ""} ${flag.evidence ?? ""}`),
  );
}

function hasFutureDate(match: CalmReadMatch, now: Date): boolean {
  if (!match.nextDateAt) return false;
  const time = new Date(match.nextDateAt).getTime();
  return !Number.isNaN(time) && time > now.getTime();
}

function hasCompletedDate(match: CalmReadMatch): boolean {
  return (match.dateHistory?.length ?? 0) > 0;
}

function safetyLens(match: CalmReadMatch): CalmReadModel["safety"] {
  const flags = allFlags(match);
  const serious =
    /threat|intimidat|stalk|harass|coerc|sextortion|intimate image|money|gift card|crypto|fraud|privacy|location|password|unsafe|boundary/i;
  const hasHigh =
    (match.redFlagSummary?.highSeverityCount ?? 0) > 0 ||
    flags.some((flag) => flag.severity === "high");
  const hasMediumSafety = flags.some(
    (flag) =>
      flag.severity === "medium" &&
      serious.test(`${flag.label ?? ""} ${flag.evidence ?? ""}`),
  );

  if (hasHigh && hasPattern(flags, serious)) {
    return {
      level: "Elevated",
      sentence: "This needs safety support before you move forward.",
      tone: "danger",
    };
  }
  if (hasMediumSafety) {
    return {
      level: "Moderate",
      sentence:
        "This may be a boundary concern. Slow down and bring your circle in.",
      tone: "warning",
    };
  }
  return {
    level: "Low",
    sentence: "This is not a safety concern based on the current evidence.",
    tone: "success",
  };
}

function clarityLens(
  match: CalmReadMatch,
  now: Date,
): CalmReadModel["clarity"] {
  const flags = allFlags(match);
  if (hasPattern(flags, /cool|slower|distant|low effort|one-word|dry/i)) {
    return {
      level: "Cooling",
      sentence: "Recent signals look cooler or lower-effort than before.",
      tone: "warning",
    };
  }
  if (
    hasPattern(
      flags,
      /soft availability|vague|not sure|follow-through|no concrete|scheduling|plan/i,
    )
  ) {
    return {
      level: "Mixed",
      sentence: "There is warmth, but the next step is not concrete yet.",
      tone: "primary",
    };
  }
  if (hasFutureDate(match, now) || (match.greenFlags?.length ?? 0) > 0) {
    return {
      level: "Clear",
      sentence: "The current evidence shows reciprocity or follow-through.",
      tone: "success",
    };
  }
  return {
    level: "Unclear",
    sentence:
      "There is not enough current evidence to read momentum confidently.",
    tone: "muted",
  };
}

function paceLens(match: CalmReadMatch): CalmReadModel["pace"] {
  const text = allFlags(match)
    .map((flag) => `${flag.label ?? ""} ${flag.evidence ?? ""}`)
    .join(" ");
  if (/love bombing|pressure|too fast|intense|trauma bonding/i.test(text)) {
    return {
      level: "Fast",
      sentence:
        "The emotional pace may be moving faster than the evidence supports.",
      tone: "warning",
    };
  }
  if (
    /overshar|heavy disclosure|vulnerab|grief|trauma/i.test(text) ||
    (match.greenFlags?.length ?? 0) > 0
  ) {
    return {
      level: "Moderate",
      sentence:
        "There is some openness or vulnerability, but not necessarily too fast.",
      tone: "primary",
    };
  }
  return {
    level: "Normal",
    sentence: "The emotional pace looks normal for the current stage.",
    tone: "success",
  };
}

function freshness(match: CalmReadMatch): CalmReadModel["freshness"] {
  const pending = pendingCount(match);
  if (pending > 0) {
    return {
      label: `${pending} screenshot${pending === 1 ? "" : "s"} waiting`,
      tone: "warning",
    };
  }
  if (
    match.readFreshness === "current" &&
    match.analysisFreshness === "current"
  ) {
    return { label: "Up to date", tone: "success" };
  }
  if (match.readFreshness === "missing") {
    return { label: "Not analyzed yet", tone: "warning" };
  }
  return { label: "Refresh recommended", tone: "warning" };
}

function summaryFor(match: CalmReadMatch): string {
  return (
    clean(match.lastRead?.body) ??
    clean(match.overallRead) ??
    "The story is still forming. Add screenshots, notes, or a debrief so HeyTelli can ground the read in receipts."
  );
}

function headlineFor(
  match: CalmReadMatch,
  safety: CalmReadModel["safety"],
  clarity: CalmReadModel["clarity"],
): string {
  if (safety.level === "Elevated") return "Pause before moving forward.";
  if (clarity.level === "Mixed")
    return "Warm signs exist. Momentum is not confirmed.";
  if (clarity.level === "Cooling") return "Something may be cooling.";
  if (clarity.level === "Clear") return "The current signals are steady.";
  return "The story is still forming.";
}

function nextMoveFor(
  match: CalmReadMatch,
  safety: CalmReadModel["safety"],
  clarity: CalmReadModel["clarity"],
  now: Date,
): string {
  if (safety.level === "Elevated") {
    return "Share this with your circle before responding or meeting. Keep plans public and use support resources if you feel pressured or unsafe.";
  }
  if (safety.level === "Moderate") {
    return "Slow down, verify the plan, and tell your circle before meeting or escalating the conversation.";
  }
  if (pendingCount(match) > 0) {
    return "Analyze the new screenshots before deciding. The saved read stays visible until the refresh finishes.";
  }
  if (hasFutureDate(match, now)) {
    return "Confirm the plan, make the Date Card, and keep your own way home.";
  }
  if (match.lastSpeaker === "her") {
    return clarity.level === "Mixed"
      ? "Reply once, warmly. Do not chase. Watch whether they reopen the thread or follow through."
      : "Review the latest message, then reply with one clear next step.";
  }
  if (match.lastSpeaker === "me") {
    return "Wait for their reply. Let the next signal come from them.";
  }
  return "Add the latest screenshots or a quick note before making a call.";
}

function patternCategory(
  flag: RedFlagLike,
): CalmReadModel["patternStates"][number]["category"] {
  const text = `${flag.label ?? ""} ${flag.evidence ?? ""}`;
  if (
    /threat|stalk|money|gift card|crypto|coerc|sextortion|boundary|privacy|unsafe/i.test(
      text,
    )
  )
    return "Safety risk";
  if (/vulnerab|trauma|intense|pace|disclosure|grief/i.test(text))
    return "Emotional pacing";
  if (/reply|text|message|dodg|question/i.test(text)) return "Communication";
  return "Dating clarity";
}

function patternState(
  match: CalmReadMatch,
  flag: RedFlagLike,
): Pick<CalmReadModel["patternStates"][number], "state" | "reason"> {
  const text = `${flag.label ?? ""} ${flag.evidence ?? ""}`;
  const historical =
    flag.status === "previously-seen" ||
    (match.historicalRedFlags ?? []).includes(flag);
  const planningConcern =
    /meet|date|plan|schedule|availability|follow-through/i.test(text);

  if (historical && planningConcern && hasCompletedDate(match)) {
    return {
      state: "Partially resolved",
      reason: "Later planned or completed date behavior softened this concern.",
    };
  }
  if (historical) {
    return {
      state: "Historical",
      reason: "Saved for memory, but not hot in the latest evidence.",
    };
  }
  if (flag.severity === "high") {
    return {
      state: "Escalating",
      reason: "High-severity concern should stay visible until reviewed.",
    };
  }
  return {
    state: "Active",
    reason: "Still visible in the latest analyzed evidence.",
  };
}

function patternStates(match: CalmReadMatch): CalmReadModel["patternStates"] {
  return allFlags(match)
    .map((flag) => {
      const label = clean(flag.label);
      if (!label) return null;
      const state = patternState(match, flag);
      return {
        label,
        evidence: clean(flag.evidence) ?? "Saved observation from analysis.",
        category: patternCategory(flag),
        state: state.state,
        reason: state.reason,
      };
    })
    .filter(
      (item): item is CalmReadModel["patternStates"][number] => item != null,
    )
    .slice(0, 6);
}

export function getCalmReadModel(
  match: CalmReadMatch,
  now = new Date(),
): CalmReadModel {
  const safety = safetyLens(match);
  const clarity = clarityLens(match, now);
  const pace = paceLens(match);
  const readFreshness = freshness(match);
  const summary = summaryFor(match);

  return {
    label: "The Calm Read",
    headline: headlineFor(match, safety, clarity),
    summary,
    nextMove: nextMoveFor(match, safety, clarity, now),
    safety,
    clarity,
    pace,
    freshness: readFreshness,
    latestRead: clean(match.lastRead?.body)
      ? {
          title: "Latest saved read",
          body: summary,
          freshnessLabel: readFreshness.label,
        }
      : null,
    patternStates: patternStates(match),
  };
}
```

- [ ] **Step 4: Run the model tests to verify they pass**

Run:

```bash
pnpm --dir scripts exec tsx --test ../artifacts/bumble-mobile/lib/calm-read.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the model helper**

```bash
git add artifacts/bumble-mobile/lib/calm-read.ts artifacts/bumble-mobile/lib/calm-read.test.ts
git commit -m "feat: model calm read"
```

---

### Task 2: Calm Read Card Component

**Files:**

- Create: `artifacts/bumble-mobile/components/CalmReadCard.tsx`

- [ ] **Step 1: Create the Calm Read card component**

Create `artifacts/bumble-mobile/components/CalmReadCard.tsx`:

```tsx
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Body, Card, SectionLabel } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import {
  getCalmReadModel,
  type CalmReadLensTone,
  type CalmReadMatch,
} from "@/lib/calm-read";

function toneColors(tone: CalmReadLensTone, c: ReturnType<typeof useColors>) {
  if (tone === "success")
    return { bg: c.successBg, fg: c.success, border: c.success + "55" };
  if (tone === "warning")
    return { bg: c.warningBg, fg: c.warning, border: c.warning + "55" };
  if (tone === "danger")
    return {
      bg: c.destructive + "12",
      fg: c.destructive,
      border: c.destructive + "55",
    };
  if (tone === "primary")
    return { bg: c.infoBg, fg: c.info, border: c.info + "55" };
  return { bg: c.muted, fg: c.mutedForeground, border: c.border };
}

export function CalmReadCard({ match }: { match: CalmReadMatch }) {
  const c = useColors();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const model = useMemo(() => getCalmReadModel(match), [match]);
  const safetyTone = toneColors(model.safety.tone, c);
  const freshnessTone = toneColors(model.freshness.tone, c);

  return (
    <Card style={{ borderColor: safetyTone.border, gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: c.secondary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name="heart" size={19} color={c.secondaryForeground} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <SectionLabel>{model.label}</SectionLabel>
          <Text
            style={{
              color: c.foreground,
              fontSize: 19,
              fontWeight: "800",
              lineHeight: 24,
            }}
          >
            {model.headline}
          </Text>
        </View>
      </View>

      <Body muted style={{ fontSize: 13, lineHeight: 20 }}>
        {model.summary}
      </Body>

      <View style={{ gap: 8 }}>
        <View
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: safetyTone.border,
            backgroundColor: safetyTone.bg,
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        >
          <Text
            style={{
              color: safetyTone.fg,
              fontSize: 13,
              fontWeight: "700",
              lineHeight: 18,
            }}
          >
            {model.safety.sentence}
          </Text>
        </View>
        <View
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: c.warning + "44",
            backgroundColor: c.warningBg,
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        >
          <Text style={{ color: c.foreground, fontSize: 13, lineHeight: 19 }}>
            <Text style={{ fontWeight: "800" }}>Best next move: </Text>
            {model.nextMove}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <LensPill
          label="Safety"
          value={model.safety.level}
          tone={model.safety.tone}
        />
        <LensPill
          label="Clarity"
          value={model.clarity.level}
          tone={model.clarity.tone}
        />
        <LensPill
          label="Pace"
          value={model.pace.level}
          tone={model.pace.tone}
        />
      </View>

      <View
        style={{
          alignSelf: "flex-start",
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          borderRadius: 999,
          backgroundColor: freshnessTone.bg,
          paddingHorizontal: 9,
          paddingVertical: 5,
        }}
      >
        <Feather name="refresh-cw" size={11} color={freshnessTone.fg} />
        <Text
          style={{ color: freshnessTone.fg, fontSize: 11, fontWeight: "800" }}
        >
          {model.freshness.label}
        </Text>
      </View>

      {model.latestRead ? (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: c.border,
            paddingTop: 10,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Toggle latest saved read"
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setDetailsOpen((value) => !value);
            }}
            style={({ pressed }) => ({
              minHeight: 36,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Text
              style={{ color: c.foreground, fontSize: 13, fontWeight: "700" }}
            >
              {model.latestRead.title}
            </Text>
            <Feather
              name={detailsOpen ? "chevron-up" : "chevron-down"}
              size={17}
              color={c.mutedForeground}
            />
          </Pressable>
          {detailsOpen ? (
            <Text
              style={{
                color: c.mutedForeground,
                fontSize: 12,
                lineHeight: 18,
                marginTop: 4,
              }}
            >
              {model.latestRead.body}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

function LensPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: CalmReadLensTone;
}) {
  const c = useColors();
  const colors = toneColors(tone, c);
  return (
    <View
      style={{
        flex: 1,
        minHeight: 66,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.bg,
        padding: 9,
        justifyContent: "center",
        gap: 3,
      }}
    >
      <Text
        style={{
          color: colors.fg,
          fontSize: 10,
          fontWeight: "900",
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
      <Text
        style={{ color: colors.fg, fontSize: 16, fontWeight: "900" }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}
```

- [ ] **Step 2: Run mobile typecheck**

Run:

```bash
pnpm --filter @workspace/bumble-mobile run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit the component**

```bash
git add artifacts/bumble-mobile/components/CalmReadCard.tsx
git commit -m "feat: add calm read card"
```

---

### Task 3: Match Detail Integration

**Files:**

- Modify: `artifacts/bumble-mobile/app/match/[id].tsx`
- Test: `artifacts/bumble-mobile/lib/match-detail-surfacing.test.ts`

- [ ] **Step 1: Update the static surfacing test**

Append this test to `artifacts/bumble-mobile/lib/match-detail-surfacing.test.ts`:

```ts
test("Calm Read is the primary match detail read surface", async () => {
  const screen = await readFile(
    path.join(root, "artifacts/bumble-mobile/app/match/[id].tsx"),
    "utf8",
  );

  assert.match(
    screen,
    /import \{ CalmReadCard \} from "@\/components\/CalmReadCard"/,
  );
  assert.match(screen, /<CalmReadCard\s+match=\{data\}\s*\/>/);
  assert.doesNotMatch(screen, /<LatestReadCard\s+match=\{data\}/);

  const todaySection =
    screen.match(
      /selectedSection === "today"[\s\S]*?selectedSection === "read"/,
    )?.[0] ?? "";
  assert.ok(
    todaySection.indexOf("<CalmReadCard") <
      todaySection.indexOf("<ScreenshotIntakeCard"),
  );

  const readSection =
    screen.match(
      /selectedSection === "read"[\s\S]*?selectedSection === "story"/,
    )?.[0] ?? "";
  assert.ok(
    readSection.indexOf("<CalmReadCard") < readSection.indexOf("<GutCheckCard"),
  );
  assert.ok(
    readSection.indexOf("<GutCheckCard") < readSection.indexOf("<RedFlagsCard"),
  );
});
```

- [ ] **Step 2: Run the static test to verify it fails**

Run:

```bash
pnpm --dir scripts exec tsx --test ../artifacts/bumble-mobile/lib/match-detail-surfacing.test.ts
```

Expected: FAIL because `CalmReadCard` is not imported/rendered yet.

- [ ] **Step 3: Wire Calm Read into match detail**

Edit `artifacts/bumble-mobile/app/match/[id].tsx`:

```tsx
import { CalmReadCard } from "@/components/CalmReadCard";
```

In the `today` section, replace `NextStepCard` and `LatestReadCard` with:

```tsx
<CalmReadCard match={data} />
```

In the `read` section, replace `LatestReadCard` with:

```tsx
<CalmReadCard match={data} />
```

Keep `ScreenshotIntakeCard`, `AnalyzeNewScreenshotsCard`, `GutCheckCard`, and `RedFlagsCard` below it.

- [ ] **Step 4: Run the static test**

Run:

```bash
pnpm --dir scripts exec tsx --test ../artifacts/bumble-mobile/lib/match-detail-surfacing.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run mobile typecheck**

Run:

```bash
pnpm --filter @workspace/bumble-mobile run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit the screen integration**

```bash
git add 'artifacts/bumble-mobile/app/match/[id].tsx' artifacts/bumble-mobile/lib/match-detail-surfacing.test.ts
git commit -m "feat: make calm read primary match detail card"
```

---

### Task 4: Evidence & Receipts Calibration

**Files:**

- Modify: `artifacts/bumble-mobile/components/RedFlagsCard.tsx`
- Test: `artifacts/bumble-mobile/lib/match-detail-surfacing.test.ts`
- Test: `artifacts/bumble-mobile/lib/safety-resources.test.ts`

- [ ] **Step 1: Add static test coverage for calmer evidence language**

Append this test to `artifacts/bumble-mobile/lib/match-detail-surfacing.test.ts`:

```ts
test("pattern details are framed as evidence and receipts instead of a danger score", async () => {
  const card = await readFile(
    path.join(root, "artifacts/bumble-mobile/components/RedFlagsCard.tsx"),
    "utf8",
  );

  assert.match(card, /Evidence & receipts/);
  assert.doesNotMatch(card, /<SectionLabel>Pattern radar<\/SectionLabel>/);
  assert.match(
    card,
    /backgroundColor:\s*showAlert\s*\?\s*c\.destructive\s*:\s*c\.muted/,
  );
});
```

- [ ] **Step 2: Run the static test to verify it fails**

Run:

```bash
pnpm --dir scripts exec tsx --test ../artifacts/bumble-mobile/lib/match-detail-surfacing.test.ts
```

Expected: FAIL because `RedFlagsCard` still says `Pattern radar`.

- [ ] **Step 3: Rename the RedFlagsCard header and neutralize the count**

In `artifacts/bumble-mobile/components/RedFlagsCard.tsx`, change:

```tsx
<SectionLabel>Pattern radar</SectionLabel>
```

to:

```tsx
<SectionLabel>Evidence & receipts</SectionLabel>
```

Change the count badge style from destructive-only:

```tsx
backgroundColor: c.destructive,
```

to:

```tsx
backgroundColor: showAlert ? c.destructive : c.muted,
```

Change count text color from destructive-only:

```tsx
color: c.destructiveForeground,
```

to:

```tsx
color: showAlert ? c.destructiveForeground : c.foreground,
```

- [ ] **Step 4: Confirm safety resources still stay thresholded**

Run:

```bash
pnpm --dir scripts exec tsx --test ../artifacts/bumble-mobile/lib/safety-resources.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run static surfacing test**

Run:

```bash
pnpm --dir scripts exec tsx --test ../artifacts/bumble-mobile/lib/match-detail-surfacing.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit evidence language**

```bash
git add artifacts/bumble-mobile/components/RedFlagsCard.tsx artifacts/bumble-mobile/lib/match-detail-surfacing.test.ts
git commit -m "fix: calm pattern evidence language"
```

---

### Task 5: Final Verification

**Files:**

- Verify repo-wide relevant tests and typecheck.

- [ ] **Step 1: Run Calm Read tests**

```bash
pnpm --dir scripts exec tsx --test ../artifacts/bumble-mobile/lib/calm-read.test.ts ../artifacts/bumble-mobile/lib/match-detail-surfacing.test.ts ../artifacts/bumble-mobile/lib/safety-resources.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run mobile typecheck**

```bash
pnpm --filter @workspace/bumble-mobile run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run improvement tests to ensure swarm guardrails stayed intact**

```bash
pnpm --filter @workspace/scripts run test:improvement
```

Expected: PASS.

- [ ] **Step 4: Inspect diff for forbidden product drift**

Run:

```bash
rg -n "dangerous|unsafe|toxicity score|risk score|narciss|AI says" artifacts/bumble-mobile/lib/calm-read.ts artifacts/bumble-mobile/components/CalmReadCard.tsx artifacts/bumble-mobile/app/match/[id].tsx
```

Expected: no matches except acceptable safety classification text that does not label the person.

- [ ] **Step 5: Commit any final fixes**

```bash
git status --short
```

Expected: clean after all planned commits.
