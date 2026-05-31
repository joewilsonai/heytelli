import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  applyColorTheme,
  loadStoredColorTheme,
  normalizeWebColorThemePreference,
  storeColorTheme,
  WEB_COLOR_THEME_OPTIONS,
  WEB_COLOR_THEME_STORAGE_KEY,
  type WebColorThemePreference,
} from "./color-theme";

type MemoryStorage = {
  values: Map<string, string>;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function createMemoryStorage(): MemoryStorage {
  const values = new Map<string, string>();
  return {
    values,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("web theme options stay in parity with mobile theme options", () => {
  const mobileColors = readFileSync(
    path.resolve(
      import.meta.dirname,
      "../../../bumble-mobile/constants/colors.ts",
    ),
    "utf8",
  );

  const mobileThemeBlock = mobileColors.match(
    /export const COLOR_THEME_OPTIONS = \[([\s\S]*?)\] as const;/,
  )?.[1];
  assert.ok(mobileThemeBlock);

  const mobileThemeValues = [
    ...mobileThemeBlock.matchAll(/\{\s*value:\s*"([^"]+)",\s*label:/g),
  ].map((match) => match[1]);

  assert.deepEqual(
    WEB_COLOR_THEME_OPTIONS.map((option) => option.value),
    mobileThemeValues,
  );
  assert.deepEqual(mobileThemeValues, [
    "heytelli",
    "rose",
    "ocean",
    "sage",
    "plum",
    "sunset",
  ]);
});

test("web color theme preferences normalize, store, and apply safely", () => {
  const storage = createMemoryStorage();
  const root = { dataset: {} as Record<string, string> };

  assert.equal(normalizeWebColorThemePreference("plum"), "plum");
  assert.equal(normalizeWebColorThemePreference("unknown"), "heytelli");
  assert.equal(loadStoredColorTheme(storage), "heytelli");

  storeColorTheme(storage, "sunset");
  assert.equal(storage.getItem(WEB_COLOR_THEME_STORAGE_KEY), "sunset");
  assert.equal(loadStoredColorTheme(storage), "sunset");

  applyColorTheme(loadStoredColorTheme(storage), root);
  assert.equal(root.dataset["colorTheme"], "sunset");

  storeColorTheme(storage, "heytelli" as WebColorThemePreference);
  assert.equal(storage.getItem(WEB_COLOR_THEME_STORAGE_KEY), null);
});
