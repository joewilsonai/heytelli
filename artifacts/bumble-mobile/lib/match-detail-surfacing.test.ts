import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

test("pattern radar shows saved green flags and overall read before rerunning analysis", async () => {
  const card = await readFile(
    path.join(root, "artifacts/bumble-mobile/components/RedFlagsCard.tsx"),
    "utf8",
  );
  const screen = await readFile(
    path.join(root, "artifacts/bumble-mobile/app/match/[id].tsx"),
    "utf8",
  );

  assert.match(card, /initialRedFlags\?\.[\s\S]*greenFlags/);
  assert.match(
    card,
    /data\?\.greenFlags\s*\?\?\s*initialRedFlags\?\.greenFlags/,
  );
  assert.match(
    card,
    /data\?\.overallRead\s*\?\?\s*initialRedFlags\?\.overallRead/,
  );
  assert.match(screen, /greenFlags:\s*data\.greenFlags\s*\?\?\s*\[\]/);
  assert.match(screen, /overallRead:\s*data\.overallRead\s*\?\?\s*""/);
});

test("timeline includes analyzed screenshots as visible story moments", async () => {
  const screen = await readFile(
    path.join(root, "artifacts/bumble-mobile/app/match/[id].tsx"),
    "utf8",
  );

  assert.match(screen, /"screenshot_import"/);
  assert.match(screen, /if \(type === "screenshot_import"\) return "image"/);
});

test("new screenshots have one Analyze new action for read, patterns, and date brief", async () => {
  const screen = await readFile(
    path.join(root, "artifacts/bumble-mobile/app/match/[id].tsx"),
    "utf8",
  );
  const handler =
    screen.match(
      /const runFullAnalysisUpdate = async \(\) => \{[\s\S]*?\n  \};/,
    )?.[0] ?? "";

  assert.match(screen, /AnalyzeNewScreenshotsCard/);
  assert.match(screen, /getMatchAnalysisActionPlan/);
  assert.match(screen, /label="Analyze new"/);
  assert.match(handler, /await rescoreMatch\(data\.id\)/);
  assert.match(handler, /await getRedFlagRadar\(data\.id\)/);
  assert.match(handler, /analysisPlan\.actions\.includes\("dateBrief"\)/);
  assert.match(handler, /await generateDateBrief\(data\.id\)/);
});

test("Analyze new clears stale local pattern radar state after refetch", async () => {
  const card = await readFile(
    path.join(root, "artifacts/bumble-mobile/components/RedFlagsCard.tsx"),
    "utf8",
  );
  const screen = await readFile(
    path.join(root, "artifacts/bumble-mobile/app/match/[id].tsx"),
    "utf8",
  );
  const handler =
    screen.match(
      /const runFullAnalysisUpdate = async \(\) => \{[\s\S]*?\n  \};/,
    )?.[0] ?? "";

  assert.match(screen, /analysisRefreshVersion/);
  assert.match(handler, /await refetch\(\);[\s\S]*setAnalysisRefreshVersion/);
  assert.match(screen, /analysisRefreshKey=\{analysisRefreshVersion\}/);
  assert.match(card, /useEffect\(\(\) => \{[\s\S]*setData\(null\);/);
  assert.match(card, /\}, \[analysisRefreshKey\]\);/);
});

test("evidence receipts header uses Analyze new when screenshots are waiting", async () => {
  const card = await readFile(
    path.join(root, "artifacts/bumble-mobile/components/RedFlagsCard.tsx"),
    "utf8",
  );

  assert.match(card, /const radarHeaderAction = hasRadarDetails/);
  assert.match(card, /analysisUpdate\s*\?\s*analysisUpdate\.onPress/);
  assert.match(card, /disabled=\{radarHeaderLoading\}/);
  assert.match(card, /\?\s*"refresh-cw"\s*:\s*"zap"/);
});

test("Date brief stays available when Analyze new is shown", async () => {
  const screen = await readFile(
    path.join(root, "artifacts/bumble-mobile/app/match/[id].tsx"),
    "utf8",
  );
  const card =
    screen.match(
      /function NextDateCard\([\s\S]*?\nfunction PostDateDebriefCard/,
    )?.[0] ?? "";

  assert.match(card, /const shouldAnalyzeNew = hasUnanalyzedScreens/);
  assert.match(card, /label="Analyze new"/);
  assert.match(card, /onPress=\{analysisUpdate!\.onPress\}/);
  assert.match(card, /const briefActionLabel =[\s\S]*"Generate date brief"/);
  assert.match(card, /label=\{briefActionLabel\}/);
  assert.match(card, /onPress=\{loadBrief\}/);
});

test("Date brief can be copied from the person profile", async () => {
  const screen = await readFile(
    path.join(root, "artifacts/bumble-mobile/app/match/[id].tsx"),
    "utf8",
  );
  const card =
    screen.match(
      /function NextDateCard\([\s\S]*?\nfunction PostDateDebriefCard/,
    )?.[0] ?? "";

  assert.match(screen, /import \* as Clipboard from "expo-clipboard"/);
  assert.match(screen, /function buildDateBriefTitle/);
  assert.match(card, /const briefTitle = buildDateBriefTitle\(match\.name\)/);
  assert.match(card, /Clipboard\.setStringAsync\(savedBrief\.brief\)/);
  assert.match(card, /label=\{briefCopied \? "Copied" : "Copy"\}/);
  assert.match(card, /icon="copy"/);
});

test("match detail is split into jumpable sections instead of one long feed", async () => {
  const screen = await readFile(
    path.join(root, "artifacts/bumble-mobile/app/match/[id].tsx"),
    "utf8",
  );

  assert.match(screen, /type MatchDetailSection =/);
  assert.match(screen, /MatchSectionTabs/);
  assert.match(screen, /MATCH_DETAIL_SECTIONS/);
  assert.match(screen, /id: "today"[\s\S]*label: "Today"/);
  assert.match(screen, /id: "read"[\s\S]*label: "Read"/);
  assert.match(screen, /id: "story"[\s\S]*label: "Story"/);
  assert.match(screen, /id: "date"[\s\S]*label: "Date"/);
  assert.match(screen, /id: "talk"[\s\S]*label: "Talk"/);
  assert.match(screen, /selectedSection === "today"/);
  assert.match(screen, /selectedSection === "read"/);
  assert.match(screen, /selectedSection === "story"/);
  assert.match(screen, /selectedSection === "date"/);
  assert.match(screen, /selectedSection === "talk"/);
});

test("Calm Read replaces latest read as the primary match detail surface", async () => {
  const screen = await readFile(
    path.join(root, "artifacts/bumble-mobile/app/match/[id].tsx"),
    "utf8",
  );
  const calmReadCard = await readFile(
    path.join(root, "artifacts/bumble-mobile/components/CalmReadCard.tsx"),
    "utf8",
  );

  assert.match(screen, /import \{ CalmReadCard \}/);
  assert.doesNotMatch(screen, /function LatestReadCard/);
  assert.doesNotMatch(screen, /<LatestReadCard/);
  assert.doesNotMatch(screen, /function NextStepCard/);
  assert.doesNotMatch(screen, /<NextStepCard/);
  assert.match(calmReadCard, /The Calm Read|model\.label/);
  assert.match(calmReadCard, /Best next move/);
  assert.match(calmReadCard, /Safety Risk: \{model\.safety\.level\}/);
});

test("Read tab orders Calm Read before gut checks and evidence receipts", async () => {
  const screen = await readFile(
    path.join(root, "artifacts/bumble-mobile/app/match/[id].tsx"),
    "utf8",
  );
  const readSection =
    screen.match(
      /selectedSection === "read"[\s\S]*?selectedSection === "story"/,
    )?.[0] ?? "";

  const calmIndex = readSection.indexOf("<CalmReadCard");
  const gutCheckIndex = readSection.indexOf("<GutCheckCard");
  const receiptsIndex = readSection.indexOf("<RedFlagsCard");

  assert.ok(calmIndex >= 0, "Read section should render CalmReadCard");
  assert.ok(gutCheckIndex > calmIndex, "Gut Check should follow Calm Read");
  assert.ok(
    receiptsIndex > gutCheckIndex,
    "Evidence receipts should follow Gut Check",
  );
});

test("evidence receipts language avoids alarm-coded pattern radar framing", async () => {
  const card = await readFile(
    path.join(root, "artifacts/bumble-mobile/components/RedFlagsCard.tsx"),
    "utf8",
  );

  assert.match(card, /Evidence & receipts/);
  assert.match(card, /saved observation/);
  assert.match(card, /ACTIVE RECEIPTS/);
  assert.doesNotMatch(card, /<SectionLabel>Pattern radar<\/SectionLabel>/);
  assert.doesNotMatch(card, /Analyze patterns/);
});
