export const WEB_COLOR_THEME_STORAGE_KEY = "heytelli_web_color_theme";

export const WEB_COLOR_THEME_OPTIONS = [
  {
    value: "heytelli",
    label: "HeyTelli",
    swatches: ["#B3483A", "#F2F2F7", "#2A5F86"],
  },
  {
    value: "rose",
    label: "Rose",
    swatches: ["#C85B7A", "#FCF7F9", "#9D3657"],
  },
  {
    value: "ocean",
    label: "Ocean",
    swatches: ["#267C88", "#F4FAFA", "#2D6D56"],
  },
  {
    value: "sage",
    label: "Sage",
    swatches: ["#4F7D56", "#F6FAF4", "#3D6B44"],
  },
  {
    value: "plum",
    label: "Plum",
    swatches: ["#7E5AA7", "#FAF7FC", "#386B8E"],
  },
  {
    value: "sunset",
    label: "Sunset",
    swatches: ["#C66B2D", "#FFF8F1", "#9B4E1F"],
  },
] as const;

export type WebColorThemePreference =
  (typeof WEB_COLOR_THEME_OPTIONS)[number]["value"];

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const values = new Set<string>(
  WEB_COLOR_THEME_OPTIONS.map((option) => option.value),
);

function browserStorage(): StorageLike | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function normalizeWebColorThemePreference(
  value: unknown,
): WebColorThemePreference {
  return typeof value === "string" && values.has(value)
    ? (value as WebColorThemePreference)
    : "heytelli";
}

export function loadStoredColorTheme(
  storage: StorageLike | null = browserStorage(),
): WebColorThemePreference {
  return normalizeWebColorThemePreference(
    storage?.getItem(WEB_COLOR_THEME_STORAGE_KEY),
  );
}

export function storeColorTheme(
  storage: StorageLike | null = browserStorage(),
  theme: WebColorThemePreference,
): void {
  if (!storage) return;
  const normalized = normalizeWebColorThemePreference(theme);
  if (normalized === "heytelli") {
    storage.removeItem(WEB_COLOR_THEME_STORAGE_KEY);
    return;
  }
  storage.setItem(WEB_COLOR_THEME_STORAGE_KEY, normalized);
}

export function applyColorTheme(
  theme: WebColorThemePreference,
  root: Pick<HTMLElement, "dataset"> | null =
    typeof document === "undefined" ? null : document.documentElement,
): void {
  if (!root) return;
  root.dataset["colorTheme"] = normalizeWebColorThemePreference(theme);
}
