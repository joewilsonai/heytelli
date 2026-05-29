import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath, URL as NodeURL } from "node:url";

import { resolveColorPalette } from "../constants/colors.ts";

function read(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new NodeURL(relativePath, import.meta.url)),
    "utf8",
  );
}

function functionBlock(source: string, name: string): string {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} not found`);
  const rest = source.slice(start + 1);
  const nextFunction = rest.search(/\nfunction [A-Z]/);
  return source.slice(
    start,
    nextFunction === -1 ? undefined : start + 1 + nextFunction,
  );
}

function assertNoTrackedText(file: string, source: string): void {
  for (const match of source.matchAll(/letterSpacing:\s*(-?\d+(?:\.\d+)?)/g)) {
    assert.equal(
      Number(match[1]),
      0,
      `${file} uses tracked text at index ${match.index}`,
    );
  }
}

function relativeLuminance(hex: string): number {
  const channels = hex
    .replace("#", "")
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);
  assert.equal(channels?.length, 3, `${hex} is not a 6-digit hex color`);
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const fg = relativeLuminance(foreground);
  const bg = relativeLuminance(background);
  const light = Math.max(fg, bg);
  const dark = Math.min(fg, bg);
  return (light + 0.05) / (dark + 0.05);
}

test("shared controls use Apple-sized tap targets and quiet typography", () => {
  const ui = read("../components/ui.tsx");
  const button = functionBlock(ui, "Button");
  const iconButton = functionBlock(ui, "IconButton");
  const sectionLabel = functionBlock(ui, "SectionLabel");

  assert.match(button, /minHeight:\s*44/);
  assert.match(button, /fontWeight:\s*"700"/);
  assert.match(iconButton, /width:\s*44/);
  assert.match(iconButton, /height:\s*44/);
  assert.match(iconButton, /justifyContent:\s*"center"/);
  assert.match(sectionLabel, /letterSpacing:\s*0/);
  assert.match(functionBlock(ui, "Chip"), /minHeight:\s*44/);
});

test("HeyTelli palette uses iOS grouped neutrals with semantic accents", () => {
  const appConfig = read("../app.json");
  const light = resolveColorPalette({
    colorScheme: "light",
    colorTheme: "heytelli",
    systemScheme: "dark",
  });
  const dark = resolveColorPalette({
    colorScheme: "dark",
    colorTheme: "heytelli",
    systemScheme: "light",
  });

  assert.equal(light.background, "#F2F2F7");
  assert.match(appConfig, /"backgroundColor": "#F2F2F7"/);
  assert.equal(light.card, "#FFFFFF");
  assert.equal(light.foreground, "#1C1C1E");
  assert.equal(light.border, "#D1D1D6");
  assert.equal(light.info, "#0057B8");
  assert.equal(light.accent, "#EAF2F8");
  assert.equal(dark.background, "#000000");
  assert.equal(dark.card, "#1C1C1E");
  assert.equal(dark.foreground, "#F5F5F7");
  assert.equal(dark.border, "#38383A");
  assert.ok(contrastRatio(light.success, light.successBg) >= 4.5);
  assert.ok(contrastRatio(light.warning, light.warningBg) >= 4.5);
  assert.ok(contrastRatio(light.info, light.infoBg) >= 4.5);
});

test("core mobile screens avoid tracked micro-label text", () => {
  const files = [
    "../app/index.tsx",
    "../app/match/[id].tsx",
    "../app/settings.tsx",
    "../components/CheatSheetCard.tsx",
    "../components/RedFlagsCard.tsx",
    "../components/ResponseStatsCard.tsx",
    "../components/StaleNudgesSection.tsx",
    "../components/ui.tsx",
  ];

  for (const file of files) {
    assertNoTrackedText(file, read(file));
  }
});

test("navigation affordances use familiar icons and brand-colored primary actions", () => {
  const home = read("../app/index.tsx");
  const match = read("../app/match/[id].tsx");
  const settings = read("../app/settings.tsx");
  const todayAction = functionBlock(home, "TodayActionLink");
  const matchJumpCard = functionBlock(match, "SectionJumpCard");
  const settingsJumpGrid = functionBlock(settings, "SectionJumpGrid");

  assert.match(
    todayAction,
    /backgroundColor:\s*emphasized \? c\.primary : c\.card/,
  );
  assert.match(
    todayAction,
    /borderColor:\s*emphasized \? c\.primary : c\.border/,
  );
  assert.match(
    todayAction,
    /color=\{emphasized \? c\.primaryForeground : c\.foreground\}/,
  );
  assert.match(matchJumpCard, /Feather name="chevron-right"/);
  assert.doesNotMatch(matchJumpCard, /<Text[\s\S]*\{label\}/);
  assert.match(settingsJumpGrid, /minHeight:\s*56/);
  assert.match(settingsJumpGrid, /Feather name="chevron-down"/);
});

test("cover mode keeps hidden safety actions accessible after long press", () => {
  const match = read("../app/match/[id].tsx");

  assert.match(match, /accessibilityLabel="Reveal Date Mode safety actions"/);
  assert.match(
    match,
    /accessibilityHint="Long press to open private safety actions"/,
  );
  assert.match(match, /Date Mode safety actions/);
  assert.match(match, /accessibilityLabel="Edit Date Mode plan"/);
  assert.match(match, /accessibilityLabel="Hide Date Mode safety actions"/);
  assert.match(
    match,
    /accessibilityLabel=\{`Send \$\{action\.label\} update`\}/,
  );
});

test("voice debrief copy stays partner-neutral and product-consistent", () => {
  const voiceDebrief = read("../components/VoiceDebriefSheet.tsx");

  assert.doesNotMatch(voiceDebrief, /what she said/i);
  assert.doesNotMatch(voiceDebrief, /her date history/i);
  assert.match(voiceDebrief, /what\s+they said/);
  assert.match(voiceDebrief, /this connection's\s+date history/);
});
