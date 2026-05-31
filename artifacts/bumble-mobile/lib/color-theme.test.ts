import assert from "node:assert/strict";
import test from "node:test";

import {
  APP_COLOR_SCHEME_OPTIONS,
  COLOR_THEME_OPTIONS,
  normalizeColorSchemePreference,
  normalizeColorThemePreference,
  resolveColorPalette,
  resolveColorScheme,
} from "../constants/colors.ts";

test("color scheme preferences normalize and resolve light mode choices", () => {
  assert.deepEqual(
    APP_COLOR_SCHEME_OPTIONS.map((option) => option.value),
    ["system", "light", "dark"],
  );

  assert.equal(normalizeColorSchemePreference("nope"), "system");
  assert.equal(resolveColorScheme("system", "dark"), "dark");
  assert.equal(resolveColorScheme("system", "light"), "light");
  assert.equal(resolveColorScheme("system", null), "light");
  assert.equal(resolveColorScheme("light", "dark"), "light");
  assert.equal(resolveColorScheme("dark", "light"), "dark");
});

test("color themes expose complete light and dark palettes", () => {
  assert.deepEqual(
    COLOR_THEME_OPTIONS.map((option) => option.value),
    ["heytelli", "rose", "ocean", "sage", "plum", "sunset"],
  );
  assert.equal(normalizeColorThemePreference("nope"), "heytelli");

  const heytelli = resolveColorPalette({
    colorScheme: "light",
    colorTheme: "heytelli",
    systemScheme: "dark",
  });
  const rose = resolveColorPalette({
    colorScheme: "light",
    colorTheme: "rose",
    systemScheme: "dark",
  });
  const oceanDark = resolveColorPalette({
    colorScheme: "dark",
    colorTheme: "ocean",
    systemScheme: "light",
  });
  const sage = resolveColorPalette({
    colorScheme: "light",
    colorTheme: "sage",
    systemScheme: "dark",
  });
  const plumDark = resolveColorPalette({
    colorScheme: "dark",
    colorTheme: "plum",
    systemScheme: "light",
  });
  const sunset = resolveColorPalette({
    colorScheme: "light",
    colorTheme: "sunset",
    systemScheme: "dark",
  });

  assert.equal(heytelli.background, "#F2F2F7");
  assert.equal(heytelli.card, "#FFFFFF");
  assert.equal(heytelli.border, "#D1D1D6");
  assert.notEqual(rose.primary, heytelli.primary);
  assert.equal(oceanDark.background, "#0F1A1B");
  assert.ok(oceanDark.primaryForeground);
  assert.ok(oceanDark.accentForeground);
  assert.equal(sage.primary, "#4F7D56");
  assert.equal(plumDark.background, "#1A1321");
  assert.equal(sunset.accent, "#FFE1C7");
  assert.equal(
    new Set([
      rose.primary,
      oceanDark.primary,
      sage.primary,
      plumDark.primary,
      sunset.primary,
    ]).size,
    5,
  );
});
