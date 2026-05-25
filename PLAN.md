# HeyTelli Phase 1 Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the current Haystack/Bumble CRM scaffold into the Phase 1 HeyTelli iOS-first mobile MVP: a private women-first dating clarity and safety memory layer.

**Architecture:** Keep the monorepo and Expo/React Native scaffold for speed, but prove inbound iOS share-sheet screenshot intake first. Convert product language, data model, AI prompts, mobile surfaces, and backend API from "matches + ratings" to "connections + timeline events + first-person reflections." Keep web as an authenticated internal/admin console only; consumer web stays Phase 2.

**Tech Stack:** Expo/React Native + Expo Router + EAS custom dev builds, TypeScript, TanStack Query, Express during conversion with Fastify/Railway as target backend, Postgres + Drizzle, OpenAPI/Orval, OpenRouter/OpenAI-compatible AI, Whisper transcription, native share sheet, Cloudflare R2 target storage.

---

## Source Of Truth

- Product PRD: `/Users/joewilson/Downloads/heytelliprd.md`
- Repo root: `/Users/joewilson/pythonprojects/heytelli`
- Current mobile artifact: `artifacts/bumble-mobile`
- Current API artifact: `artifacts/api-server`
- Current web companion/admin candidate: `artifacts/bumble-reply`
- API contract: `lib/api-spec/openapi.yaml`
- Generated clients: `lib/api-client-react`, `lib/api-zod`
- DB schema: `lib/db/src/schema`

## Non-Negotiables

- Do not ship ratings of the other person: no safety score, toxicity score, dateability score, sex score, conversion score, or verdict.
- Do not build a hosted trusted-circle dossier in Phase 1.
- Do not build a friend account, friend comments, friend reactions, or a multi-user workspace.
- Phase 1 consumer product is mobile-first/iOS-first.
- Web in Phase 1 is only an authenticated internal/admin console for founder operations, QA, support, deletion verification, extraction debugging, and API inspection.
- "Share to HeyTelli" from the iOS share sheet is a product-critical ingestion path. Validate it before deeper conversion work.
- AI outputs must be neutral events, first-person reflection prompts, summaries, contextual observations, and grounding pulses. No diagnoses, no "safe/unsafe" classifications, no danger claims.

## File Structure Plan

- `PLAN.md` — this execution plan.
- `docs/heytelli-prd.md` — committed copy of the latest PRD from Downloads.
- `README.md` — rewrite from Haystack/Bumble CRM to HeyTelli Phase 1.
- `replit.md` — replace generic scaffold text with current runbook and gotchas.
- `artifacts/bumble-mobile/app.json` — rename app to HeyTelli and configure inbound sharing.
- `artifacts/bumble-mobile/app/+native-intent.ts` — route inbound share intents to the import confirmation screen.
- `artifacts/bumble-mobile/app/add/shared.tsx` — new shared-screenshot intake confirmation screen.
- `artifacts/bumble-mobile/app/add.tsx` — keep manual picker import, updated for HeyTelli connection language.
- `artifacts/bumble-mobile/app/index.tsx` — convert home from matches list to connections workspace.
- `artifacts/bumble-mobile/app/connection/[id].tsx` — new connection dashboard route.
- `artifacts/bumble-mobile/app/connection/[id]/timeline.tsx` — timeline events and reflections.
- `artifacts/bumble-mobile/app/connection/[id]/date-brief.tsx` — date plan and check-in reminder.
- `artifacts/bumble-mobile/app/connection/[id]/photos.tsx` — screenshot gallery with raw-image minimization status.
- `artifacts/bumble-mobile/app/chat/[id].tsx` — convert wingman chat to AI Reflection Assistant.
- `artifacts/bumble-mobile/components/VibeCheckCard.tsx` — render shareable card for native sharing.
- `artifacts/bumble-mobile/components/GroundingPulseCard.tsx` — calm pattern-noticing card.
- `artifacts/bumble-mobile/lib/share-intake.ts` — normalize inbound shared image payloads.
- `artifacts/bumble-mobile/lib/vibe-card.ts` — view-shot/share helpers.
- `artifacts/api-server/src/routes/connections.ts` — replacement connection API route.
- `artifacts/api-server/src/routes/openrouter.ts` — replace wingman prompt flow with reflection assistant flow or split into `reflectionAssistant.ts`.
- `artifacts/api-server/src/lib/connectionExtraction.ts` — neutral transcript/event extraction.
- `artifacts/api-server/src/lib/groundingPulses.ts` — deterministic + AI-assisted pulse generation from reflections and neutral events.
- `artifacts/api-server/src/lib/reflectionAssistant.ts` — bounded assistant prompt and response handling.
- `artifacts/api-server/src/lib/objectStorage.ts` — add raw-image purge helper and future R2 interface boundary.
- `lib/db/src/schema/connections.ts` — connection records.
- `lib/db/src/schema/connectionScreenshots.ts` — screenshot metadata, extracted text, purge state.
- `lib/db/src/schema/connectionEvents.ts` — neutral timeline facts.
- `lib/db/src/schema/reflections.ts` — first-person user reflections and optional circle attribution.
- `lib/db/src/schema/dateBriefs.ts` — date plan, check-in window, and status.
- `lib/api-spec/openapi.yaml` — new HeyTelli contract.
- `artifacts/bumble-reply/src` — convert to internal/admin console after the mobile/API contract is stable.

---

## Task 1: Commit The Product Truth

**Files:**
- Create: `docs/heytelli-prd.md`
- Modify: `README.md`
- Modify: `replit.md`

- [ ] **Step 1: Copy the latest PRD into the repo**

Run:

```bash
cp /Users/joewilson/Downloads/heytelliprd.md docs/heytelli-prd.md
```

Expected: `docs/heytelli-prd.md` exists and starts with `# HeyTelli — Product Requirements Document (Consolidated v2)`.

- [ ] **Step 2: Rewrite the README around HeyTelli**

Replace `README.md` with:

```markdown
# HeyTelli

HeyTelli is a private AI-assisted dating clarity app for women navigating modern online dating. It helps users import screenshots, reconstruct conversation timelines, record reflections, prepare for dates, and share optional Vibe Check image cards through the native share sheet.

The product is not a public review board, a "rate men" platform, a crowdsourced accusation network, a surveillance product, or an AI danger detector.

## Phase 1 Product Shape

- iOS-first mobile app built with Expo / React Native and EAS custom dev builds.
- Backend API for extraction, transcription, reflection assistant, and storage lifecycle.
- Internal/admin web console only. The consumer web app is Phase 2 after mobile retention is proven.
- Native sharing matters: "Share to HeyTelli" from Photos/share sheet is a critical ingestion path.

## Core Rules

- No ratings or verdicts about another person.
- No friend accounts, hosted dossiers, comments, reactions, or multi-user workspace.
- Vibe Check sharing is native image-card sharing, not a hosted profile.
- AI outputs neutral events, summaries, first-person reflection prompts, contextual observations, and grounding pulses.

## Repo Layout

```text
artifacts/
  api-server/          API and AI orchestration
  bumble-mobile/       Current Expo mobile app scaffold, becoming HeyTelli
  bumble-reply/        Current web companion, becoming internal/admin console
  mockup-sandbox/      Design sandbox
lib/
  api-spec/            OpenAPI contract
  api-client-react/    Generated API client
  api-zod/             Generated Zod schemas
  db/                  Drizzle schema and DB client
docs/
  heytelli-prd.md      Product source of truth
```

## Local Commands

```bash
pnpm install
pnpm typecheck
pnpm --filter @workspace/api-spec run codegen
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/bumble-mobile run dev
pnpm --filter @workspace/bumble-reply run dev
```

## Required Environment

Secrets live outside the repo. Load API keys from:

```bash
source ~/.luna/secrets/keys.env
```
```

- [ ] **Step 3: Update `replit.md` with project-specific guidance**

Replace `replit.md` with:

```markdown
# HeyTelli Runbook

## Product

HeyTelli is an iOS-first private dating clarity and safety memory layer for women. Phase 1 is mobile-first. Web is internal/admin only.

## Commands

- `pnpm install` — install workspace dependencies.
- `pnpm typecheck` — full workspace typecheck.
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas after editing `lib/api-spec/openapi.yaml`.
- `pnpm --filter @workspace/api-server run dev` — run the API server.
- `pnpm --filter @workspace/bumble-mobile run dev` — run the Expo mobile app scaffold.
- `pnpm --filter @workspace/bumble-reply run dev` — run the web/admin scaffold.

## Product Guardrails

- Do not add ratings, rankings, toxicity scores, safety scores, diagnoses, or danger verdicts.
- Do not create friend accounts or friend-facing hosted connection pages.
- Do not store third-party assessments as objective facts.
- Store the user's own reflections and neutral event facts.
- Treat raw screenshots as transient whenever technically possible.

## Implementation Priority

First prove inbound iOS share-sheet screenshot intake. If Expo/EAS cannot support a reliable "Share to HeyTelli" flow, implement a native iOS share extension before the broader product conversion.
```

- [ ] **Step 4: Verify docs**

Run:

```bash
rg -n "Haystack|Bumble CRM|sexPotential|conversionAbility|Grok Wingman" README.md replit.md docs/heytelli-prd.md
```

Expected: no matches in `README.md` or `replit.md`; any matches in `docs/heytelli-prd.md` are only historical references from the PRD if intentionally preserved.

- [ ] **Step 5: Commit**

Run:

```bash
git add README.md replit.md docs/heytelli-prd.md
git commit -m "docs: establish heytelli product truth"
```

Expected: commit succeeds with only docs staged.

---

## Task 2: Prove "Share To HeyTelli" Inbound Screenshot Intake

**Files:**
- Modify: `artifacts/bumble-mobile/package.json`
- Modify: `artifacts/bumble-mobile/app.json`
- Create: `artifacts/bumble-mobile/app/+native-intent.ts`
- Create: `artifacts/bumble-mobile/app/add/shared.tsx`
- Create: `artifacts/bumble-mobile/lib/share-intake.ts`

- [ ] **Step 1: Install inbound sharing dependency**

Run:

```bash
pnpm --filter @workspace/bumble-mobile exec expo install expo-sharing
```

Expected: `artifacts/bumble-mobile/package.json` includes `expo-sharing`.

- [ ] **Step 2: Configure Expo inbound sharing**

Modify `artifacts/bumble-mobile/app.json` so the app is named HeyTelli and includes the `expo-sharing` config plugin:

```json
{
  "expo": {
    "name": "HeyTelli",
    "slug": "heytelli",
    "scheme": "heytelli",
    "plugins": [
      [
        "expo-sharing",
        {
          "ios": {
            "enabled": true,
            "activationRule": {
              "supportsImageWithMaxCount": 5
            }
          },
          "android": {
            "enabled": true,
            "singleShareMimeTypes": ["image/*"],
            "multipleShareMimeTypes": ["image/*"]
          }
        }
      ]
    ]
  }
}
```

Preserve the existing plugin entries for `expo-router`, `expo-font`, `expo-web-browser`, `expo-av`, `expo-calendar`, and `expo-notifications`.

- [ ] **Step 3: Add native intent routing**

Create `artifacts/bumble-mobile/app/+native-intent.ts`:

```ts
import { getSharedPayloads } from "expo-sharing";

export async function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  try {
    const url = new URL(path);
    if (url.hostname === "expo-sharing") {
      const payloads = getSharedPayloads();
      const hasImage = payloads.some(
        (payload) =>
          payload.shareType === "image" ||
          payload.mimeType?.toLowerCase().startsWith("image/"),
      );
      return hasImage ? "/add/shared" : "/add";
    }
    return path;
  } catch {
    return "/";
  }
}
```

- [ ] **Step 4: Add payload normalization helper**

Create `artifacts/bumble-mobile/lib/share-intake.ts`:

```ts
import type { ResolvedSharePayload } from "expo-sharing";

export type SharedImage = {
  uri: string;
  name: string;
  mimeType: string | null;
  size: number | null;
};

export function getSharedImages(payloads: ResolvedSharePayload[]): SharedImage[] {
  return payloads
    .filter((payload) => payload.contentType === "image" && payload.contentUri)
    .map((payload, index) => ({
      uri: payload.contentUri,
      name: payload.originalName ?? `shared-screenshot-${index + 1}.jpg`,
      mimeType: payload.contentMimeType ?? null,
      size: payload.contentSize ?? null,
    }));
}
```

- [ ] **Step 5: Add shared import confirmation screen**

Create `artifacts/bumble-mobile/app/add/shared.tsx`:

```tsx
import { Image } from "expo-image";
import { clearSharedPayloads, useIncomingShare } from "expo-sharing";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Card, H1, SectionLabel } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { getSharedImages } from "@/lib/share-intake";

export default function SharedImportScreen() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { resolvedSharedPayloads, isResolving, error } = useIncomingShare();
  const images = useMemo(
    () => getSharedImages(resolvedSharedPayloads),
    [resolvedSharedPayloads],
  );

  const cancel = () => {
    clearSharedPayloads();
    router.replace("/");
  };

  const continueImport = () => {
    if (images.length === 0) {
      Alert.alert("No screenshots found", "Share one or more images to import.");
      return;
    }
    router.replace({
      pathname: "/add",
      params: {
        sharedImageUris: JSON.stringify(images.map((image) => image.uri)),
      },
    });
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{
        paddingTop: insets.top + 24,
        paddingHorizontal: 20,
        paddingBottom: insets.bottom + 24,
        gap: 14,
      }}
    >
      <H1>Import to HeyTelli</H1>
      <Text style={{ color: c.mutedForeground, fontSize: 14 }}>
        Review the screenshots before HeyTelli extracts the conversation.
      </Text>

      {isResolving ? (
        <Card>
          <ActivityIndicator color={c.primary} />
        </Card>
      ) : error ? (
        <Card>
          <SectionLabel>Share Error</SectionLabel>
          <Text style={{ color: c.destructive }}>
            {error.message || "HeyTelli could not read the shared screenshots."}
          </Text>
        </Card>
      ) : images.length === 0 ? (
        <Card>
          <SectionLabel>No Images</SectionLabel>
          <Text style={{ color: c.foreground }}>
            Share screenshots or photos to import them.
          </Text>
        </Card>
      ) : (
        <Card>
          <SectionLabel>{images.length} Screenshot{images.length === 1 ? "" : "s"}</SectionLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {images.map((image) => (
              <Image
                key={image.uri}
                source={{ uri: image.uri }}
                style={{
                  width: 92,
                  height: 160,
                  borderRadius: 12,
                  backgroundColor: c.muted,
                }}
                contentFit="cover"
              />
            ))}
          </View>
        </Card>
      )}

      <Button label="Continue" icon="arrow-right" onPress={continueImport} />
      <Pressable onPress={cancel} style={{ alignItems: "center", padding: 12 }}>
        <Text style={{ color: c.mutedForeground, fontFamily: "Inter_600SemiBold" }}>
          Cancel
        </Text>
      </Pressable>
    </ScrollView>
  );
}
```

- [ ] **Step 6: Wire `/add` to accept shared image URIs**

Modify `artifacts/bumble-mobile/app/add.tsx` to read `sharedImageUris` from `useLocalSearchParams`, parse it once on mount, and feed each URI into the same upload pipeline used by the picker. The shared import path should create one connection and attach all selected screenshots to it.

Implementation detail:

```ts
const { sharedImageUris } = useLocalSearchParams<{ sharedImageUris?: string }>();

useEffect(() => {
  if (!sharedImageUris || autoLaunched.current) return;
  autoLaunched.current = true;
  const uris = JSON.parse(sharedImageUris);
  if (Array.isArray(uris) && uris.every((uri) => typeof uri === "string")) {
    void uploadSharedBatch(uris);
  }
}, [sharedImageUris]);
```

The existing auto-launch of the image picker should only run when `sharedImageUris` is absent.

- [ ] **Step 7: Typecheck mobile**

Run:

```bash
pnpm --filter @workspace/bumble-mobile run typecheck
```

Expected: TypeScript passes or fails only on missing generated API names that are addressed in later tasks. If it fails for `expo-sharing` types, adjust imports to match installed SDK types before continuing.

- [ ] **Step 8: Build a dev client for iOS**

Run:

```bash
pnpm dlx eas-cli build --profile development --platform ios
```

Expected: build succeeds and installs on a physical iPhone or simulator build target.

- [ ] **Step 9: Manual iOS share-sheet acceptance test**

On an iPhone:

1. Open Photos.
2. Select 1 screenshot.
3. Tap Share.
4. Confirm HeyTelli appears as a share target.
5. Tap HeyTelli.
6. Confirm the app opens to `Import to HeyTelli`.
7. Confirm the image preview renders.
8. Repeat with 5 screenshots.

Expected: both 1-image and 5-image imports land on the confirmation screen with all previews visible.

- [ ] **Step 10: Decision gate**

If Step 9 passes on a physical iPhone, keep Expo/EAS for Phase 1. If Step 9 fails because HeyTelli does not appear, payloads are missing, previews cannot access files, or App Store review risk is unacceptable, stop broad conversion and implement a native iOS share extension path before continuing.

- [ ] **Step 11: Commit**

Run:

```bash
git add artifacts/bumble-mobile/package.json artifacts/bumble-mobile/app.json artifacts/bumble-mobile/app/+native-intent.ts artifacts/bumble-mobile/app/add/shared.tsx artifacts/bumble-mobile/lib/share-intake.ts artifacts/bumble-mobile/app/add.tsx
git commit -m "feat: spike inbound screenshot sharing"
```

Expected: commit succeeds and records the technical spike.

---

## Task 3: Rename The Mobile Shell To HeyTelli

**Files:**
- Modify: `artifacts/bumble-mobile/app.json`
- Modify: `artifacts/bumble-mobile/app/_layout.tsx`
- Modify: `artifacts/bumble-mobile/app/index.tsx`
- Modify: `artifacts/bumble-mobile/constants/colors.ts`
- Modify: `artifacts/bumble-mobile/components/ui.tsx`

- [ ] **Step 1: Rename visible app surfaces**

Replace visible `Haystack`, `Bumble`, `Wingman`, `match`, and `matches` copy with HeyTelli language:

- `Haystack` → `HeyTelli`
- `Matches` → `Connections`
- `Match` → `Connection`
- `Wingman chat` → `Reflection Assistant`
- `Add match` → `Import connection`
- `Vet before you meet` → `Remember clearly before you meet`

- [ ] **Step 2: Update palette direction**

Modify `artifacts/bumble-mobile/constants/colors.ts` to reduce orange/dating-app energy:

```ts
const colors = {
  light: {
    text: "#1D1B20",
    tint: "#6F6A8F",
    background: "#FAF8F4",
    foreground: "#1D1B20",
    card: "#FFFFFF",
    cardForeground: "#1D1B20",
    primary: "#6F6A8F",
    primaryForeground: "#FFFFFF",
    secondary: "#EEE9F3",
    secondaryForeground: "#343044",
    muted: "#F0EEE9",
    mutedForeground: "#69656F",
    accent: "#E7F0EA",
    accentForeground: "#274338",
    destructive: "#B42318",
    destructiveForeground: "#FFFFFF",
    border: "#E3DDD2",
    input: "#E3DDD2",
    success: "#327A5B",
    successBg: "#DDEFE6",
    warning: "#9A6A24",
    warningBg: "#F4E7C8",
  },
  dark: {
    text: "#F5F2ED",
    tint: "#B7B0D6",
    background: "#121014",
    foreground: "#F5F2ED",
    card: "#1D1A22",
    cardForeground: "#F5F2ED",
    primary: "#B7B0D6",
    primaryForeground: "#121014",
    secondary: "#292532",
    secondaryForeground: "#E8E0FF",
    muted: "#222026",
    mutedForeground: "#AAA4B0",
    accent: "#21352E",
    accentForeground: "#DDEFE6",
    destructive: "#EF4444",
    destructiveForeground: "#FFFFFF",
    border: "#302C35",
    input: "#302C35",
    success: "#66C394",
    successBg: "#143624",
    warning: "#D9A441",
    warningBg: "#3A2A0A",
  },
  radius: 14,
};

export default colors;
```

- [ ] **Step 3: Typecheck mobile**

Run:

```bash
pnpm --filter @workspace/bumble-mobile run typecheck
```

Expected: no copy-related TypeScript errors.

- [ ] **Step 4: Manual UI smoke test**

Run:

```bash
pnpm --filter @workspace/bumble-mobile run dev
```

Expected: mobile app starts and the first screen says `HeyTelli` with connection-oriented copy.

- [ ] **Step 5: Commit**

Run:

```bash
git add artifacts/bumble-mobile
git commit -m "feat: rebrand mobile shell to heytelli"
```

Expected: commit contains only mobile shell copy and token changes.

---

## Task 4: Replace Ratings Schema With HeyTelli Data Model

**Files:**
- Create: `lib/db/src/schema/connections.ts`
- Create: `lib/db/src/schema/connectionScreenshots.ts`
- Create: `lib/db/src/schema/connectionEvents.ts`
- Create: `lib/db/src/schema/reflections.ts`
- Create: `lib/db/src/schema/dateBriefs.ts`
- Modify: `lib/db/src/schema/index.ts`
- Modify: `lib/db/src/index.ts`

- [ ] **Step 1: Add `connections` schema**

Create `lib/db/src/schema/connections.ts`:

```ts
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type ConnectionStatus = "active" | "paused" | "archived";

export const connections = pgTable("connections", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().default("single-user"),
  displayName: text("display_name").notNull(),
  sourceApp: text("source_app"),
  status: text("status").$type<ConnectionStatus>().notNull().default("active"),
  avatarPath: text("avatar_path"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const insertConnectionSchema = createInsertSchema(connections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Connection = typeof connections.$inferSelect;
export type InsertConnection = z.infer<typeof insertConnectionSchema>;
```

- [ ] **Step 2: Add screenshot schema**

Create `lib/db/src/schema/connectionScreenshots.ts`:

```ts
import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { connections } from "./connections";

export type ExtractionStatus = "pending" | "processing" | "completed" | "failed";

export type StructuredScreenshotData = {
  transcriptTurns: Array<{ speaker: "user" | "other"; text: string }>;
  detectedName: string | null;
  sourceApp: string | null;
  neutralEvents: Array<{
    eventType: string;
    occurredAt: string | null;
    summary: string;
    metadata: Record<string, unknown>;
  }>;
};

export const connectionScreenshots = pgTable("connection_screenshots", {
  id: serial("id").primaryKey(),
  connectionId: integer("connection_id")
    .notNull()
    .references(() => connections.id, { onDelete: "cascade" }),
  objectPath: text("object_path").notNull(),
  extractionStatus: text("extraction_status")
    .$type<ExtractionStatus>()
    .notNull()
    .default("pending"),
  extractionError: text("extraction_error"),
  extractedText: text("extracted_text"),
  structuredData: jsonb("structured_data").$type<StructuredScreenshotData>(),
  rawImagePurgedAt: timestamp("raw_image_purged_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertConnectionScreenshotSchema = createInsertSchema(
  connectionScreenshots,
).omit({
  id: true,
  createdAt: true,
});

export type ConnectionScreenshot = typeof connectionScreenshots.$inferSelect;
export type InsertConnectionScreenshot = z.infer<typeof insertConnectionScreenshotSchema>;
```

- [ ] **Step 3: Add events schema**

Create `lib/db/src/schema/connectionEvents.ts`:

```ts
import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { connections } from "./connections";

export type ConnectionEventType =
  | "message_imported"
  | "date_logged"
  | "voice_debrief"
  | "check_in_completed"
  | "days_since_contact"
  | "manual_note";

export const connectionEvents = pgTable("connection_events", {
  id: serial("id").primaryKey(),
  connectionId: integer("connection_id")
    .notNull()
    .references(() => connections.id, { onDelete: "cascade" }),
  eventType: text("event_type").$type<ConnectionEventType>().notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  summary: text("summary").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertConnectionEventSchema = createInsertSchema(connectionEvents).omit({
  id: true,
  createdAt: true,
});

export type ConnectionEvent = typeof connectionEvents.$inferSelect;
export type InsertConnectionEvent = z.infer<typeof insertConnectionEventSchema>;
```

- [ ] **Step 4: Add reflections schema**

Create `lib/db/src/schema/reflections.ts`:

```ts
import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { connections } from "./connections";

export type ReflectionLens =
  | "how_i_felt"
  | "my_energy_after"
  | "communication_rhythm"
  | "what_i_want_to_remember"
  | "open_questions";

export type FeltSentiment =
  | "grounded"
  | "clear"
  | "curious"
  | "uncertain"
  | "anxious"
  | "drained"
  | "mixed";

export const reflections = pgTable("reflections", {
  id: serial("id").primaryKey(),
  connectionId: integer("connection_id")
    .notNull()
    .references(() => connections.id, { onDelete: "cascade" }),
  lens: text("lens").$type<ReflectionLens>().notNull(),
  feltSentiment: text("felt_sentiment").$type<FeltSentiment>(),
  reflectionText: text("reflection_text").notNull(),
  circleAttribution: text("circle_attribution"),
  observedAt: timestamp("observed_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertReflectionSchema = createInsertSchema(reflections).omit({
  id: true,
  createdAt: true,
});

export type Reflection = typeof reflections.$inferSelect;
export type InsertReflection = z.infer<typeof insertReflectionSchema>;
```

- [ ] **Step 5: Add date briefs schema**

Create `lib/db/src/schema/dateBriefs.ts`:

```ts
import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { connections } from "./connections";

export type DateBriefStatus =
  | "planned"
  | "checked_in"
  | "extended"
  | "home_safe"
  | "expired"
  | "cancelled";

export const dateBriefs = pgTable("date_briefs", {
  id: serial("id").primaryKey(),
  connectionId: integer("connection_id")
    .notNull()
    .references(() => connections.id, { onDelete: "cascade" }),
  locationText: text("location_text").notNull(),
  dateTime: timestamp("date_time", { withTimezone: true }).notNull(),
  checkInWindowMinutes: integer("check_in_window_minutes").notNull().default(180),
  trustedFriendName: text("trusted_friend_name"),
  checkInMessage: text("check_in_message"),
  status: text("status").$type<DateBriefStatus>().notNull().default("planned"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const insertDateBriefSchema = createInsertSchema(dateBriefs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DateBrief = typeof dateBriefs.$inferSelect;
export type InsertDateBrief = z.infer<typeof insertDateBriefSchema>;
```

- [ ] **Step 6: Export schemas**

Modify `lib/db/src/schema/index.ts`:

```ts
export * from "./connections";
export * from "./connectionScreenshots";
export * from "./connectionEvents";
export * from "./reflections";
export * from "./dateBriefs";
```

Keep old exports only if existing build references still require them during the same commit. Remove old `matches` exports after API/mobile code has migrated.

- [ ] **Step 7: Typecheck DB package**

Run:

```bash
pnpm --filter @workspace/db run typecheck
```

Expected: DB package typechecks with new schemas.

- [ ] **Step 8: Commit**

Run:

```bash
git add lib/db/src/schema lib/db/src/index.ts
git commit -m "feat: add heytelli connection data model"
```

Expected: commit succeeds.

---

## Task 5: Replace OpenAPI Contract With Connection-Centered API

**Files:**
- Modify: `lib/api-spec/openapi.yaml`
- Regenerate: `lib/api-client-react/src/generated/*`
- Regenerate: `lib/api-zod/src/generated/*`

- [ ] **Step 1: Define Phase 1 endpoints**

Update `lib/api-spec/openapi.yaml` with these route groups:

```yaml
paths:
  /connections:
    get:
      operationId: listConnections
    post:
      operationId: createConnection
  /connections/{id}:
    get:
      operationId: getConnection
    patch:
      operationId: updateConnection
    delete:
      operationId: deleteConnection
  /connections/{id}/screenshots:
    get:
      operationId: listConnectionScreenshots
    post:
      operationId: addConnectionScreenshot
  /connections/{id}/process:
    post:
      operationId: processConnection
  /connections/{id}/events:
    get:
      operationId: listConnectionEvents
    post:
      operationId: createConnectionEvent
  /connections/{id}/reflections:
    get:
      operationId: listReflections
    post:
      operationId: createReflection
  /connections/{id}/grounding-pulses:
    get:
      operationId: listGroundingPulses
  /connections/{id}/date-briefs:
    get:
      operationId: listDateBriefs
    post:
      operationId: createDateBrief
  /date-briefs/{id}:
    patch:
      operationId: updateDateBrief
  /reflection-assistant/conversations:
    post:
      operationId: createReflectionConversation
  /reflection-assistant/conversations/{id}/messages:
    get:
      operationId: listReflectionMessages
    post:
      operationId: sendReflectionMessage
  /storage/uploads/request-url:
    post:
      operationId: requestUploadUrl
```

- [ ] **Step 2: Define response schemas**

Add schemas with these fields:

```yaml
Connection:
  type: object
  required: [id, displayName, status, createdAt, updatedAt]
  properties:
    id: { type: integer }
    displayName: { type: string }
    sourceApp: { type: ["string", "null"] }
    status: { type: string, enum: [active, paused, archived] }
    avatarPath: { type: ["string", "null"] }
    recentReflection: { type: ["string", "null"] }
    lastActivityAt: { type: ["string", "null"], format: date-time }
    createdAt: { type: string, format: date-time }
    updatedAt: { type: string, format: date-time }

ConnectionDetail:
  allOf:
    - $ref: "#/components/schemas/Connection"
    - type: object
      required: [screenshots, events, reflections, dateBriefs]
      properties:
        screenshots:
          type: array
          items: { $ref: "#/components/schemas/ConnectionScreenshot" }
        events:
          type: array
          items: { $ref: "#/components/schemas/ConnectionEvent" }
        reflections:
          type: array
          items: { $ref: "#/components/schemas/Reflection" }
        dateBriefs:
          type: array
          items: { $ref: "#/components/schemas/DateBrief" }
```

Also define `ConnectionScreenshot`, `ConnectionEvent`, `Reflection`, `DateBrief`, `GroundingPulse`, `ReflectionMessage`, and request bodies for create/update operations. None of these schemas may include attraction scores, safety scores, toxicity scores, diagnoses, or verdict fields.

- [ ] **Step 3: Regenerate clients**

Run:

```bash
pnpm --filter @workspace/api-spec run codegen
```

Expected: generated API hooks include `useListConnections`, `useGetConnection`, `createConnection`, `createReflection`, and `createDateBrief`.

- [ ] **Step 4: Contract scan**

Run:

```bash
rg -n "sexPotential|conversionAbility|toxicity|riskScore|safetyScore|dangerous|diagnosis|diagnose" lib/api-spec lib/api-client-react/src/generated lib/api-zod/src/generated
```

Expected: no matches.

- [ ] **Step 5: Typecheck generated packages**

Run:

```bash
pnpm --filter @workspace/api-client-react run typecheck
pnpm --filter @workspace/api-zod run typecheck
```

Expected: both packages typecheck.

- [ ] **Step 6: Commit**

Run:

```bash
git add lib/api-spec lib/api-client-react/src/generated lib/api-zod/src/generated
git commit -m "feat: define heytelli api contract"
```

Expected: commit succeeds.

---

## Task 6: Implement Connection API Routes

**Files:**
- Create: `artifacts/api-server/src/routes/connections.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`
- Create: `artifacts/api-server/src/lib/connectionDetail.ts`
- Modify: `artifacts/api-server/src/routes/matches.ts` after mobile migration to remove old route registration.

- [ ] **Step 1: Add detail loader**

Create `artifacts/api-server/src/lib/connectionDetail.ts`:

```ts
import { asc, desc, eq } from "drizzle-orm";
import {
  connectionEvents,
  connectionScreenshots,
  connections,
  dateBriefs,
  db,
  reflections,
} from "@workspace/db";

export async function loadConnectionDetail(connectionId: number) {
  const [connection] = await db
    .select()
    .from(connections)
    .where(eq(connections.id, connectionId));
  if (!connection) return null;

  const [shots, events, notes, briefs] = await Promise.all([
    db
      .select()
      .from(connectionScreenshots)
      .where(eq(connectionScreenshots.connectionId, connectionId))
      .orderBy(asc(connectionScreenshots.createdAt)),
    db
      .select()
      .from(connectionEvents)
      .where(eq(connectionEvents.connectionId, connectionId))
      .orderBy(asc(connectionEvents.occurredAt)),
    db
      .select()
      .from(reflections)
      .where(eq(reflections.connectionId, connectionId))
      .orderBy(desc(reflections.observedAt)),
    db
      .select()
      .from(dateBriefs)
      .where(eq(dateBriefs.connectionId, connectionId))
      .orderBy(desc(dateBriefs.dateTime)),
  ]);

  return {
    ...connection,
    screenshots: shots,
    events,
    reflections: notes,
    dateBriefs: briefs,
  };
}
```

- [ ] **Step 2: Add route shell**

Create `artifacts/api-server/src/routes/connections.ts` with handlers for `GET /connections`, `POST /connections`, `GET /connections/:id`, `PATCH /connections/:id`, and `DELETE /connections/:id`. Use generated Zod schemas from `@workspace/api-zod` for request validation.

The `GET /connections` response should compute:

```ts
{
  recentReflection: latestReflection?.reflectionText ?? null,
  lastActivityAt: latestEvent?.occurredAt?.toISOString() ?? connection.updatedAt.toISOString()
}
```

- [ ] **Step 3: Add screenshot route**

Implement `POST /connections/:id/screenshots`:

1. Validate connection exists.
2. Insert `connection_screenshots` with `extractionStatus: "pending"`.
3. Return refreshed connection detail.
4. Do not process AI in this endpoint; processing happens via `/connections/:id/process` so batch imports can upload multiple screenshots first.

- [ ] **Step 4: Add reflection and event routes**

Implement:

- `GET /connections/:id/events`
- `POST /connections/:id/events`
- `GET /connections/:id/reflections`
- `POST /connections/:id/reflections`

Reject reflection bodies where `reflectionText.trim()` is empty. Store `circleAttribution` as nullable free text; do not create any friend record.

- [ ] **Step 5: Add date brief routes**

Implement:

- `GET /connections/:id/date-briefs`
- `POST /connections/:id/date-briefs`
- `PATCH /date-briefs/:id`

Allowed date brief statuses: `planned`, `checked_in`, `extended`, `home_safe`, `expired`, `cancelled`.

- [ ] **Step 6: Register route**

Modify `artifacts/api-server/src/routes/index.ts`:

```ts
import connectionsRouter from "./connections";

router.use(connectionsRouter);
```

Keep old `matchesRouter` registered until mobile no longer imports generated match hooks.

- [ ] **Step 7: API typecheck**

Run:

```bash
pnpm --filter @workspace/api-server run typecheck
```

Expected: API server typechecks.

- [ ] **Step 8: Commit**

Run:

```bash
git add artifacts/api-server/src/routes/connections.ts artifacts/api-server/src/routes/index.ts artifacts/api-server/src/lib/connectionDetail.ts
git commit -m "feat: add connection api routes"
```

Expected: commit succeeds.

---

## Task 7: Replace AI Extraction With Neutral Timeline Extraction

**Files:**
- Create: `artifacts/api-server/src/lib/connectionExtraction.ts`
- Modify: `artifacts/api-server/src/routes/connections.ts`
- Modify: `artifacts/api-server/src/lib/objectStorage.ts`

- [ ] **Step 1: Add neutral extraction module**

Create `artifacts/api-server/src/lib/connectionExtraction.ts`:

```ts
import sharp from "sharp";
import { openai } from "@workspace/integrations-openai-ai-server";

export type NeutralExtraction = {
  detectedName: string | null;
  sourceApp: string | null;
  extractedText: string;
  transcriptTurns: Array<{ speaker: "user" | "other"; text: string }>;
  neutralEvents: Array<{
    eventType: "message_imported" | "manual_note";
    occurredAt: string | null;
    summary: string;
    metadata: Record<string, unknown>;
  }>;
  reflectionPrompts: string[];
};

const SYSTEM_PROMPT = `You are HeyTelli's neutral extraction assistant for a private dating clarity app used by women.

You read screenshots of dating-app profiles, dating-app chats, text messages, or social DMs.

Your job:
- Extract readable text.
- Reconstruct conversation turns when visible.
- Identify neutral timeline events.
- Suggest first-person reflection prompts for the user.

Hard rules:
- Never rate, rank, diagnose, label, or judge the other person.
- Never classify anyone as safe, unsafe, toxic, dangerous, manipulative, narcissistic, or high-risk.
- Never infer intent or character.
- Use neutral wording about observable interaction patterns.
- Reflection prompts must be phrased for the user to answer in first person.

Return only JSON:
{
  "detectedName": string | null,
  "sourceApp": string | null,
  "extractedText": string,
  "transcriptTurns": [{ "speaker": "user" | "other", "text": string }],
  "neutralEvents": [{
    "eventType": "message_imported" | "manual_note",
    "occurredAt": string | null,
    "summary": string,
    "metadata": {}
  }],
  "reflectionPrompts": string[]
}`;

async function compressForVision(dataUrl: string): Promise<string> {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return dataUrl;
  const buf = Buffer.from(match[2], "base64");
  const out = await sharp(buf)
    .rotate()
    .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 75 })
    .toBuffer();
  return `data:image/jpeg;base64,${out.toString("base64")}`;
}

export async function extractConnectionFromScreenshots(
  imageDataUrls: string[],
): Promise<NeutralExtraction> {
  const capped = imageDataUrls.slice(-5);
  const compressed = await Promise.all(capped.map(compressForVision));
  const imageParts = compressed.map((url) => ({
    type: "image_url" as const,
    image_url: { url, detail: "high" as const },
  }));

  const completion = await openai.chat.completions.create({
    model: "gpt-5.4",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          ...imageParts,
          {
            type: "text",
            text: "Extract neutral timeline data from these screenshots. Do not rate or judge the person.",
          },
        ],
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as Partial<NeutralExtraction>;
  return {
    detectedName: typeof parsed.detectedName === "string" ? parsed.detectedName : null,
    sourceApp: typeof parsed.sourceApp === "string" ? parsed.sourceApp : null,
    extractedText: typeof parsed.extractedText === "string" ? parsed.extractedText : "",
    transcriptTurns: Array.isArray(parsed.transcriptTurns)
      ? parsed.transcriptTurns.filter(
          (turn) =>
            turn &&
            (turn.speaker === "user" || turn.speaker === "other") &&
            typeof turn.text === "string" &&
            turn.text.trim().length > 0,
        )
      : [],
    neutralEvents: Array.isArray(parsed.neutralEvents) ? parsed.neutralEvents.slice(0, 20) : [],
    reflectionPrompts: Array.isArray(parsed.reflectionPrompts)
      ? parsed.reflectionPrompts.filter((prompt) => typeof prompt === "string").slice(0, 5)
      : [],
  };
}
```

- [ ] **Step 2: Implement `/connections/:id/process`**

In `artifacts/api-server/src/routes/connections.ts`, implement processing:

1. Load pending/failed screenshots for the connection.
2. Convert object paths to data URLs.
3. Run `extractConnectionFromScreenshots`.
4. Update screenshot rows with `extractionStatus: "completed"`, `extractedText`, and `structuredData`.
5. Insert neutral events into `connection_events`.
6. If connection display name is `"New connection"` and `detectedName` exists, update `displayName`.
7. Set `sourceApp` if detected.
8. Return refreshed connection detail.

- [ ] **Step 3: Add raw-image purge helper**

In `artifacts/api-server/src/lib/objectStorage.ts`, add:

```ts
async deleteObjectEntity(rawPath: string): Promise<void> {
  const normalizedPath = this.normalizeObjectEntityPath(rawPath);
  const file = await this.getObjectEntityFile(normalizedPath);
  await file.delete({ ignoreNotFound: true });
}
```

Call this helper after extraction only when the product setting `PURGE_RAW_SCREENSHOTS_AFTER_EXTRACTION=true` is enabled, then set `rawImagePurgedAt`.

- [ ] **Step 4: Guardrail scan**

Run:

```bash
rg -n "sexPotential|conversionAbility|fuck|wingman|toxicity|riskScore|safetyScore|dangerous|narciss" artifacts/api-server/src/lib/connectionExtraction.ts artifacts/api-server/src/routes/connections.ts
```

Expected: no matches.

- [ ] **Step 5: API typecheck**

Run:

```bash
pnpm --filter @workspace/api-server run typecheck
```

Expected: typecheck passes.

- [ ] **Step 6: Commit**

Run:

```bash
git add artifacts/api-server/src/lib/connectionExtraction.ts artifacts/api-server/src/routes/connections.ts artifacts/api-server/src/lib/objectStorage.ts
git commit -m "feat: add neutral screenshot extraction"
```

Expected: commit succeeds.

---

## Task 8: Build Grounding Pulses

**Files:**
- Create: `artifacts/api-server/src/lib/groundingPulses.ts`
- Modify: `artifacts/api-server/src/routes/connections.ts`
- Create: `artifacts/bumble-mobile/components/GroundingPulseCard.tsx`

- [ ] **Step 1: Add grounding pulse generator**

Create `artifacts/api-server/src/lib/groundingPulses.ts`:

```ts
import type { ConnectionEvent, Reflection } from "@workspace/db";

export type GroundingPulse = {
  id: string;
  connectionId: number;
  title: string;
  body: string;
  actions: Array<"pause_connection" | "boundary_language" | "create_vibe_check" | "add_reflection">;
  createdFrom: "reflections" | "cadence";
};

const DRAINED_WORDS = ["drained", "anxious", "uncertain", "confused", "overwhelmed"];

export function generateGroundingPulses(args: {
  connectionId: number;
  reflections: Reflection[];
  events: ConnectionEvent[];
}): GroundingPulse[] {
  const recent = args.reflections.slice(0, 5);
  const drainedCount = recent.filter((reflection) => {
    const text = `${reflection.feltSentiment ?? ""} ${reflection.reflectionText}`.toLowerCase();
    return DRAINED_WORDS.some((word) => text.includes(word));
  }).length;

  const pulses: GroundingPulse[] = [];

  if (drainedCount >= 3) {
    pulses.push({
      id: `pulse-${args.connectionId}-drained`,
      connectionId: args.connectionId,
      title: "A pattern worth noticing",
      body:
        "Your recent reflections about this connection repeatedly mention feeling uncertain or emotionally drained afterward. Sometimes clarity comes from slowing the timeline down, not speeding it up.",
      actions: ["pause_connection", "boundary_language", "create_vibe_check", "add_reflection"],
      createdFrom: "reflections",
    });
  }

  return pulses;
}
```

- [ ] **Step 2: Implement `GET /connections/:id/grounding-pulses`**

Load the latest reflections and events for a connection, call `generateGroundingPulses`, and return the result. Do not call AI for v1 pulses; deterministic pulse rules are easier to audit.

- [ ] **Step 3: Create mobile card**

Create `artifacts/bumble-mobile/components/GroundingPulseCard.tsx`:

```tsx
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { Card } from "@/components/ui";
import { useColors } from "@/hooks/useColors";

export function GroundingPulseCard({
  title,
  body,
  onAddReflection,
}: {
  title: string;
  body: string;
  onAddReflection: () => void;
}) {
  const c = useColors();
  return (
    <Card style={{ backgroundColor: c.accent, borderColor: c.accentForeground }}>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <Feather name="anchor" size={16} color={c.accentForeground} />
        <Text style={{ color: c.accentForeground, fontFamily: "Inter_700Bold", fontSize: 14 }}>
          {title}
        </Text>
      </View>
      <Text style={{ color: c.foreground, fontSize: 14, lineHeight: 20, marginTop: 10 }}>
        {body}
      </Text>
      <Pressable onPress={onAddReflection} style={{ marginTop: 12 }}>
        <Text style={{ color: c.primary, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>
          Add another reflection
        </Text>
      </Pressable>
    </Card>
  );
}
```

- [ ] **Step 4: Typecheck API and mobile**

Run:

```bash
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/bumble-mobile run typecheck
```

Expected: both typechecks pass after generated API names are aligned.

- [ ] **Step 5: Commit**

Run:

```bash
git add artifacts/api-server/src/lib/groundingPulses.ts artifacts/api-server/src/routes/connections.ts artifacts/bumble-mobile/components/GroundingPulseCard.tsx
git commit -m "feat: add grounding pulses"
```

Expected: commit succeeds.

---

## Task 9: Convert Mobile Screens To Connections And Timeline

**Files:**
- Modify: `artifacts/bumble-mobile/app/index.tsx`
- Modify: `artifacts/bumble-mobile/app/add.tsx`
- Create: `artifacts/bumble-mobile/app/connection/[id].tsx`
- Create: `artifacts/bumble-mobile/app/connection/[id]/timeline.tsx`
- Create: `artifacts/bumble-mobile/app/connection/[id]/photos.tsx`
- Modify: `artifacts/bumble-mobile/app/_layout.tsx`

- [ ] **Step 1: Home Workspace**

Replace generated match hooks in `app/index.tsx` with connection hooks:

```ts
import { useListConnections } from "@workspace/api-client-react";
```

Show:

- display name
- source app
- status
- last activity
- recent reflection
- gentle pattern indicator count if grounding pulses exist

No score chips.

- [ ] **Step 2: Add import flow**

Update `app/add.tsx` to:

1. Accept picker imports and shared imports.
2. Upload all images.
3. Create one connection with `displayName: "New connection"` when no name is known.
4. Add all screenshots to the connection.
5. Call `processConnection(connection.id)`.
6. Navigate to `/connection/${connection.id}`.

- [ ] **Step 3: Connection dashboard**

Create `app/connection/[id].tsx` with cards:

- latest grounding pulse
- recent reflections
- next date brief
- timeline preview
- screenshot import status
- buttons for Add reflection, Date Brief, Vibe Check card, Reflection Assistant

- [ ] **Step 4: Timeline screen**

Create `app/connection/[id]/timeline.tsx` showing merged events and reflections sorted by time:

```ts
type TimelineItem =
  | { kind: "event"; occurredAt: string; summary: string }
  | { kind: "reflection"; observedAt: string; reflectionText: string; lens: string };
```

Use neutral labels: `Imported messages`, `Date logged`, `Voice reflection`, `Reflection`.

- [ ] **Step 5: Photos screen**

Create `app/connection/[id]/photos.tsx` showing:

- thumbnail if raw image still exists
- extracted text summary
- `Image purged` status when `rawImagePurgedAt` is set

- [ ] **Step 6: Router layout**

Modify `_layout.tsx` stack entries:

```tsx
<Stack.Screen name="connection/[id]" options={{ title: "" }} />
<Stack.Screen name="connection/[id]/timeline" options={{ title: "Timeline" }} />
<Stack.Screen name="connection/[id]/photos" options={{ title: "Screenshots" }} />
<Stack.Screen name="connection/[id]/date-brief" options={{ title: "Date Brief" }} />
```

- [ ] **Step 7: Mobile guardrail scan**

Run:

```bash
rg -n "Sex potential|Conversion|Chemistry|score|Wingman|Grok|match|matches" artifacts/bumble-mobile/app artifacts/bumble-mobile/components
```

Expected: no user-facing `Sex potential`, `Conversion`, `Chemistry`, `Wingman`, or `Grok` copy remains. Lowercase `match` may remain only in technical route names scheduled for deletion in Task 13.

- [ ] **Step 8: Typecheck mobile**

Run:

```bash
pnpm --filter @workspace/bumble-mobile run typecheck
```

Expected: mobile typechecks.

- [ ] **Step 9: Commit**

Run:

```bash
git add artifacts/bumble-mobile/app artifacts/bumble-mobile/components
git commit -m "feat: convert mobile app to connections timeline"
```

Expected: commit succeeds.

---

## Task 10: Build Date Brief And Local Check-In Reminder

**Files:**
- Create: `artifacts/bumble-mobile/app/connection/[id]/date-brief.tsx`
- Modify: `artifacts/bumble-mobile/lib/notifications.ts`
- Modify: `artifacts/bumble-mobile/lib/calendar.ts`

- [ ] **Step 1: Add notification helpers**

Modify `artifacts/bumble-mobile/lib/notifications.ts`:

```ts
import * as Notifications from "expo-notifications";

export async function scheduleCheckInReminder(args: {
  dateBriefId: number;
  displayName: string;
  dateTime: Date;
  checkInWindowMinutes: number;
}) {
  const triggerAt = new Date(
    args.dateTime.getTime() + args.checkInWindowMinutes * 60_000,
  );
  if (triggerAt.getTime() <= Date.now()) return null;

  return Notifications.scheduleNotificationAsync({
    identifier: `date-brief-${args.dateBriefId}`,
    content: {
      title: "Check in with yourself",
      body: `Your HeyTelli check-in window for ${args.displayName} is up.`,
      data: { dateBriefId: args.dateBriefId },
    },
    trigger: triggerAt,
  });
}

export async function cancelCheckInReminder(dateBriefId: number) {
  await Notifications.cancelScheduledNotificationAsync(`date-brief-${dateBriefId}`);
}
```

- [ ] **Step 2: Add Date Brief screen**

Create `app/connection/[id]/date-brief.tsx` with fields:

- venue/location text
- date/time
- check-in window minutes
- trusted friend name
- check-in message preview

On save, call `createDateBrief`, then `scheduleCheckInReminder`.

- [ ] **Step 3: Add one-tap extension**

Add a button that calls `updateDateBrief(dateBriefId, { status: "extended", checkInWindowMinutes: current + 60 })`, reschedules notification, and shows copy: `Running late, +60 min`.

- [ ] **Step 4: Add home-safe action**

Add a button that calls `updateDateBrief(dateBriefId, { status: "home_safe" })` and cancels the local notification.

- [ ] **Step 5: Typecheck mobile**

Run:

```bash
pnpm --filter @workspace/bumble-mobile run typecheck
```

Expected: mobile typechecks.

- [ ] **Step 6: Commit**

Run:

```bash
git add artifacts/bumble-mobile/app/connection artifacts/bumble-mobile/lib/notifications.ts artifacts/bumble-mobile/lib/calendar.ts
git commit -m "feat: add date brief check-in flow"
```

Expected: commit succeeds.

---

## Task 11: Build Vibe Check Image Cards

**Files:**
- Add dependency: `react-native-view-shot`
- Create: `artifacts/bumble-mobile/components/VibeCheckCard.tsx`
- Create: `artifacts/bumble-mobile/lib/vibe-card.ts`
- Modify: `artifacts/bumble-mobile/app/connection/[id].tsx`

- [ ] **Step 1: Install card capture dependency**

Run:

```bash
pnpm --filter @workspace/bumble-mobile exec expo install react-native-view-shot expo-sharing
```

Expected: package dependency added.

- [ ] **Step 2: Create Vibe Check card component**

Create `components/VibeCheckCard.tsx` rendering:

- HeyTelli watermark
- user-chosen display name or masked name
- date plan summary if selected
- 2-4 neutral timeline highlights
- 1-2 first-person reflections
- no score, no verdict, no AI danger language

- [ ] **Step 3: Add share helper**

Create `lib/vibe-card.ts`:

```ts
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";

export async function shareVibeCheckCard(viewRef: React.RefObject<unknown>) {
  const uri = await captureRef(viewRef, {
    format: "png",
    quality: 1,
  });
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error("Native sharing is not available on this device.");
  }
  await Sharing.shareAsync(uri, {
    UTI: "public.png",
    mimeType: "image/png",
    dialogTitle: "Share Vibe Check",
  });
}
```

- [ ] **Step 4: Add connection dashboard entry point**

On `app/connection/[id].tsx`, add a `Create Vibe Check card` button. It opens a local card preview, lets the user toggle name masking, and calls `shareVibeCheckCard`.

- [ ] **Step 5: Manual share test**

On iPhone:

1. Open a connection.
2. Tap `Create Vibe Check card`.
3. Share to Messages.
4. Confirm the generated image contains no raw hidden transcript unless selected.
5. Confirm no ratings/verdict language appears.

- [ ] **Step 6: Commit**

Run:

```bash
git add artifacts/bumble-mobile/components/VibeCheckCard.tsx artifacts/bumble-mobile/lib/vibe-card.ts artifacts/bumble-mobile/app/connection
git commit -m "feat: add vibe check image cards"
```

Expected: commit succeeds.

---

## Task 12: Convert Voice Debriefs To First-Person Reflections

**Files:**
- Modify: `artifacts/api-server/src/lib/voiceDebrief.ts`
- Modify: `artifacts/api-server/src/routes/connections.ts`
- Modify: `artifacts/bumble-mobile/components/VoiceDebriefSheet.tsx`

- [ ] **Step 1: Replace voice analysis output**

Modify `voiceDebrief.ts` to return:

```ts
export type VoiceReflectionAnalysis = {
  transcript: string;
  suggestedReflection: {
    lens: "how_i_felt" | "my_energy_after" | "communication_rhythm" | "what_i_want_to_remember" | "open_questions";
    feltSentiment: "grounded" | "clear" | "curious" | "uncertain" | "anxious" | "drained" | "mixed" | null;
    reflectionText: string;
  };
  neutralEvents: Array<{
    eventType: "voice_debrief";
    summary: string;
    occurredAt: string | null;
    metadata: Record<string, unknown>;
  }>;
  followUpPrompts: string[];
};
```

No score suggestions.

- [ ] **Step 2: Add voice debrief route under connections**

Implement `POST /connections/:id/voice-debrief`:

1. Transcribe audio.
2. Generate `VoiceReflectionAnalysis`.
3. Insert a `reflection` row from `suggestedReflection`.
4. Insert `connection_events` from `neutralEvents`.
5. Return refreshed connection detail plus transcript.

- [ ] **Step 3: Update mobile sheet**

Update `VoiceDebriefSheet.tsx` copy:

- `Voice debrief` → `Voice reflection`
- `updates scores` → `turns this into a reflection`
- score cards removed
- user sees suggested first-person reflection before saving

- [ ] **Step 4: Guardrail scan**

Run:

```bash
rg -n "score|sexPotential|conversionAbility|chemistry|red flag|green flag" artifacts/api-server/src/lib/voiceDebrief.ts artifacts/bumble-mobile/components/VoiceDebriefSheet.tsx
```

Expected: no score fields and no adversarial flag framing.

- [ ] **Step 5: Commit**

Run:

```bash
git add artifacts/api-server/src/lib/voiceDebrief.ts artifacts/api-server/src/routes/connections.ts artifacts/bumble-mobile/components/VoiceDebriefSheet.tsx
git commit -m "feat: convert voice debriefs to reflections"
```

Expected: commit succeeds.

---

## Task 13: Convert Reflection Assistant And Remove Wingman Prompting

**Files:**
- Modify: `grok_prompt.md`
- Create: `artifacts/api-server/src/lib/reflectionAssistant.ts`
- Modify: `artifacts/api-server/src/routes/openrouter.ts`
- Modify: `artifacts/bumble-mobile/app/chat/[id].tsx`
- Modify: `artifacts/bumble-mobile/app/chat/index.tsx`

- [ ] **Step 1: Replace prompt file**

Replace `grok_prompt.md` with:

```markdown
# HeyTelli Reflection Assistant System Prompt

This file is loaded at runtime by the API server to build the system prompt for HeyTelli's scoped reflection assistant.

## Base

You are HeyTelli's Reflection Assistant for a private dating clarity app used by women.

Your role is to help the user remember clearly, reflect in first person, prepare for dates, phrase boundaries, and notice patterns in her own reflections and neutral timeline events.

Hard rules:
- Never diagnose, label, or classify another person.
- Never say someone is safe, unsafe, dangerous, toxic, manipulative, narcissistic, or high-risk.
- Never produce ratings, scores, rankings, or verdicts.
- Never give manipulative dating tactics.
- Keep language calm, grounded, emotionally intelligent, and practical.
- Phrase uncertainty honestly.
- Center the user's agency, feelings, memory, boundaries, and choices.

Allowed outputs:
- summaries of neutral events
- first-person reflection prompts
- date-prep questions
- boundary language options
- gentle pattern observations grounded in the user's own reflections

## No connections

{{BASE}}

The user has not imported a connection yet. Help her start by importing screenshots or writing a first reflection.

## All connections

{{BASE}}

Here is the user's current private workspace:

{{ROSTER}}

## Single connection

{{BASE}}

This chat is scoped to one connection:

{{CONNECTION_SUMMARY}}
```

- [ ] **Step 2: Implement reflection assistant context builder**

Create `artifacts/api-server/src/lib/reflectionAssistant.ts` to summarize:

- connection display name
- source app
- neutral events
- latest reflections
- date brief status
- grounding pulses

Do not include raw screenshots by default after extraction.

- [ ] **Step 3: Route assistant messages**

Modify `openrouter.ts` or create a new route so generated API endpoints under `/reflection-assistant/*` stream assistant responses using the new prompt and connection context.

- [ ] **Step 4: Update mobile chat UI copy**

Update chat screens:

- `Ask Grok...` → `Ask HeyTelli...`
- `Chat with Grok` → `Reflection Assistant`
- Empty state: `Summarize what happened, prep for the date, phrase a boundary, or compare how this felt earlier vs. now.`

- [ ] **Step 5: Prompt guardrail scan**

Run:

```bash
rg -n "fuck|sex potential|wingman|Grok Wingman|rate her|safe/unsafe|toxicity score|dangerous person" grok_prompt.md artifacts/api-server/src/lib/reflectionAssistant.ts artifacts/api-server/src/routes/openrouter.ts artifacts/bumble-mobile/app/chat
```

Expected: no matches.

- [ ] **Step 6: Commit**

Run:

```bash
git add grok_prompt.md artifacts/api-server/src/lib/reflectionAssistant.ts artifacts/api-server/src/routes/openrouter.ts artifacts/bumble-mobile/app/chat
git commit -m "feat: add heytelli reflection assistant"
```

Expected: commit succeeds.

---

## Task 14: Convert Web Companion To Internal/Admin Console

**Files:**
- Modify: `artifacts/bumble-reply/package.json`
- Modify: `artifacts/bumble-reply/src/App.tsx`
- Replace: `artifacts/bumble-reply/src/pages/*`

- [ ] **Step 1: Rename package purpose**

Modify `artifacts/bumble-reply/package.json`:

```json
{
  "name": "@workspace/heytelli-admin",
  "version": "0.0.0",
  "private": true,
  "type": "module"
}
```

Keep scripts and dependencies.

- [ ] **Step 2: Replace routes**

Admin routes:

- `/` — connection list and health summary
- `/connections/:id` — inspect connection records, events, reflections, screenshots, purge status
- `/extractions` — recent failed/pending extraction jobs
- `/deletions` — deletion verification view

No friend-facing routes.

- [ ] **Step 3: Add admin guard**

Require `ADMIN_TOKEN` in local storage or an `Authorization` header for admin API calls. The API should reject admin endpoints without `ADMIN_TOKEN`.

- [ ] **Step 4: Verify web copy**

Run:

```bash
rg -n "Vibe Check public|share link|friend comments|ratings|Bumble|Haystack|Wingman" artifacts/bumble-reply/src
```

Expected: no matches.

- [ ] **Step 5: Commit**

Run:

```bash
git add artifacts/bumble-reply
git commit -m "feat: convert web app to admin console"
```

Expected: commit succeeds.

---

## Task 15: Privacy, Deletion, And Raw Screenshot Minimization

**Files:**
- Modify: `artifacts/api-server/src/routes/storage.ts`
- Modify: `artifacts/api-server/src/lib/objectStorage.ts`
- Create: `artifacts/api-server/src/routes/privacy.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`
- Create: `artifacts/bumble-mobile/app/profile.tsx`

- [ ] **Step 1: Add delete-all route**

Create `artifacts/api-server/src/routes/privacy.ts`:

```ts
import { Router, type IRouter } from "express";
import { db, connections } from "@workspace/db";

const router: IRouter = Router();

router.delete("/privacy/workspace", async (_req, res): Promise<void> => {
  await db.delete(connections);
  res.sendStatus(204);
});

export default router;
```

This works because all connection child tables use cascade deletes.

- [ ] **Step 2: Register privacy route**

Modify `routes/index.ts`:

```ts
import privacyRouter from "./privacy";

router.use(privacyRouter);
```

- [ ] **Step 3: Add profile controls**

Create `artifacts/bumble-mobile/app/profile.tsx` with:

- biometric lock status
- export data button
- delete all data button
- privacy explanation: "HeyTelli stores your reflections and neutral timeline data. Raw screenshots are minimized after extraction where possible."

- [ ] **Step 4: Protect object reads**

In `storage.ts`, do not leave private object reads wide open in production. Add a development-only bypass:

```ts
if (process.env.NODE_ENV === "production" && !req.headers.authorization) {
  res.status(401).json({ error: "Unauthorized" });
  return;
}
```

This is a temporary guard until real auth lands.

- [ ] **Step 5: Typecheck**

Run:

```bash
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/bumble-mobile run typecheck
```

Expected: both typecheck.

- [ ] **Step 6: Commit**

Run:

```bash
git add artifacts/api-server/src/routes/privacy.ts artifacts/api-server/src/routes/index.ts artifacts/api-server/src/routes/storage.ts artifacts/api-server/src/lib/objectStorage.ts artifacts/bumble-mobile/app/profile.tsx
git commit -m "feat: add privacy controls"
```

Expected: commit succeeds.

---

## Task 16: Remove Old Match/Ratings Surfaces

**Files:**
- Delete or stop registering: `artifacts/api-server/src/routes/matches.ts`
- Delete or archive: old match-specific mobile components that are no longer imported
- Modify: `lib/db/src/schema/index.ts`
- Modify: `artifacts/api-server/src/routes/index.ts`

- [ ] **Step 1: Remove old route registration**

Modify `artifacts/api-server/src/routes/index.ts` to remove:

```ts
import matchesRouter from "./matches";
router.use(matchesRouter);
```

- [ ] **Step 2: Remove old schema exports**

Modify `lib/db/src/schema/index.ts` so it exports only HeyTelli schemas:

```ts
export * from "./connections";
export * from "./connectionScreenshots";
export * from "./connectionEvents";
export * from "./reflections";
export * from "./dateBriefs";
export * from "./conversations";
export * from "./messages";
```

Keep `conversations` and `messages` only if the reflection assistant still uses them.

- [ ] **Step 3: Dead-code scan**

Run:

```bash
rg -n "useListMatches|useGetMatch|createMatch|updateMatch|rescoreMatch|generateMatchReplies|sexPotential|conversionAbility|match_score_history|matchesRouter" artifacts lib
```

Expected: no matches in active code. Generated old API names may appear only if the OpenAPI contract still includes them; remove them from the contract before proceeding.

- [ ] **Step 4: Full typecheck**

Run:

```bash
pnpm typecheck
```

Expected: full workspace typecheck passes.

- [ ] **Step 5: Commit**

Run:

```bash
git add artifacts lib
git commit -m "chore: remove legacy match rating surfaces"
```

Expected: commit succeeds.

---

## Task 17: End-To-End Verification

**Files:**
- No required file changes unless verification exposes defects.

- [ ] **Step 1: Full workspace typecheck**

Run:

```bash
pnpm typecheck
```

Expected: pass.

- [ ] **Step 2: Full build**

Run:

```bash
pnpm run build
```

Expected: API, mobile, admin, and libraries build.

- [ ] **Step 3: API smoke test**

Run API server:

```bash
pnpm --filter @workspace/api-server run dev
```

In another terminal:

```bash
curl -s http://localhost:5000/api/healthz
```

Expected: JSON or OK health response.

- [ ] **Step 4: Mobile manual flow**

On iPhone dev build:

1. Share 1 screenshot to HeyTelli from Photos.
2. Confirm import preview appears.
3. Confirm connection is created.
4. Confirm processing creates neutral timeline events.
5. Add a first-person reflection.
6. Confirm grounding pulse appears only when reflection criteria are met.
7. Create a date brief and schedule local reminder.
8. Create and share a Vibe Check image card.

Expected: full flow works without ratings, verdicts, hosted friend pages, or male-user coaching copy.

- [ ] **Step 5: Guardrail search**

Run:

```bash
rg -n "sexPotential|conversionAbility|fuck|fuckability|Grok Wingman|rate her|toxicity score|safety score|risk score|dangerous person|narcissist|gaslighter|trustedCircleShares|web circle" .
```

Expected: no matches in active product code. Matches in historical docs should be removed or clearly marked as deprecated.

- [ ] **Step 6: Commit fixes from verification**

If verification required fixes:

```bash
git add .
git commit -m "fix: complete heytelli phase one verification"
```

Expected: clean working tree.

---

## Execution Notes

- Execute Task 2 before broad product conversion. If inbound sharing fails, switch to a native share-extension plan before continuing.
- Keep commits narrow. Do not stage unrelated local work.
- Prefer generated clients from `lib/api-spec/openapi.yaml`; do not hand-edit generated API files except through codegen.
- The current Express API may remain during conversion. Fastify/Railway migration is a later infrastructure plan unless a route-level limitation blocks Phase 1.
- Do not build temporary Check-In Links in this plan. They are a Phase 3 candidate and require a separate privacy/threat-model design.

## Self-Review

- Spec coverage: covers Phase 1 mobile MVP, inbound sharing spike, no-ratings model, single-tenant constraints, native Vibe Check image cards, Date Brief local reminders, voice reflections, reflection assistant, admin-only web, and privacy controls.
- Intentional gaps: RevenueCat, Sign in with Apple/Google/email magic links, PostHog, Sentry, Fastify/Railway migration, Cloudflare R2 migration, and Phase 3 Check-In Links require separate implementation plans after the core loop works.
- Placeholder scan: no unresolved placeholders remain in this plan.
- Type consistency: plan uses `connections`, `connectionScreenshots`, `connectionEvents`, `reflections`, and `dateBriefs` consistently.
