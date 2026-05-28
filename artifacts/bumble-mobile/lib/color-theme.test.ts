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
    ["heytelli", "rose", "ocean"],
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

  assert.equal(heytelli.background, "#FAF7F3");
  assert.notEqual(rose.primary, heytelli.primary);
  assert.equal(oceanDark.background, "#0F1A1B");
  assert.ok(oceanDark.primaryForeground);
  assert.ok(oceanDark.accentForeground);
});
