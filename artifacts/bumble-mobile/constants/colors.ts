export const APP_COLOR_SCHEME_OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

export type AppColorSchemePreference =
  (typeof APP_COLOR_SCHEME_OPTIONS)[number]["value"];

export const COLOR_THEME_OPTIONS = [
  { value: "heytelli", label: "HeyTelli" },
  { value: "rose", label: "Rose" },
  { value: "ocean", label: "Ocean" },
] as const;

export type ColorThemePreference =
  (typeof COLOR_THEME_OPTIONS)[number]["value"];

export type ResolvedColorScheme = "light" | "dark";

export type ColorPalette = {
  text: string;
  tint: string;
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  info: string;
  infoBg: string;
};

type ColorThemeDefinition = {
  label: string;
  light: ColorPalette;
  dark: ColorPalette;
};

const colorThemes: Record<ColorThemePreference, ColorThemeDefinition> = {
  heytelli: {
    label: "HeyTelli",
    light: {
      text: "#1C1C1E",
      tint: "#B3483A",
      background: "#F2F2F7",
      foreground: "#1C1C1E",
      card: "#FFFFFF",
      cardForeground: "#1C1C1E",
      primary: "#B3483A",
      primaryForeground: "#FFFFFF",
      secondary: "#F1E4DF",
      secondaryForeground: "#5E3C35",
      muted: "#E5E5EA",
      mutedForeground: "#6E6E73",
      accent: "#EAF2F8",
      accentForeground: "#2A5F86",
      destructive: "#D70015",
      destructiveForeground: "#FFFFFF",
      border: "#D1D1D6",
      input: "#D1D1D6",
      success: "#146B2E",
      successBg: "#E8F5ED",
      warning: "#8A4B00",
      warningBg: "#FFF4D9",
      info: "#0057B8",
      infoBg: "#E8F2FF",
    },
    dark: {
      text: "#F5F5F7",
      tint: "#FF8A72",
      background: "#000000",
      foreground: "#F5F5F7",
      card: "#1C1C1E",
      cardForeground: "#F5F5F7",
      primary: "#FF8A72",
      primaryForeground: "#2A0D08",
      secondary: "#2C2C2E",
      secondaryForeground: "#F5D1C8",
      muted: "#2C2C2E",
      mutedForeground: "#AEAEB2",
      accent: "#10243A",
      accentForeground: "#9BD0FF",
      destructive: "#FF6961",
      destructiveForeground: "#220B08",
      border: "#38383A",
      input: "#38383A",
      success: "#32D74B",
      successBg: "#0D2E16",
      warning: "#FFD60A",
      warningBg: "#332900",
      info: "#64D2FF",
      infoBg: "#102A3A",
    },
  },
  rose: {
    label: "Rose",
    light: {
      text: "#30242C",
      tint: "#C85B7A",
      background: "#FCF7F9",
      foreground: "#30242C",
      card: "#FFFFFF",
      cardForeground: "#30242C",
      primary: "#C85B7A",
      primaryForeground: "#FFFFFF",
      secondary: "#F5E5EC",
      secondaryForeground: "#684154",
      muted: "#F2EAEF",
      mutedForeground: "#756A72",
      accent: "#FBE0EA",
      accentForeground: "#9D3657",
      destructive: "#B44455",
      destructiveForeground: "#FFFFFF",
      border: "#E9DDE4",
      input: "#E9DDE4",
      success: "#39795D",
      successBg: "#E4F2EA",
      warning: "#A96812",
      warningBg: "#FFF1D8",
      info: "#496F93",
      infoBg: "#E8F0F8",
    },
    dark: {
      text: "#FCF7F9",
      tint: "#F08AAA",
      background: "#1B1418",
      foreground: "#FCF7F9",
      card: "#261B22",
      cardForeground: "#FCF7F9",
      primary: "#F08AAA",
      primaryForeground: "#35141F",
      secondary: "#34242C",
      secondaryForeground: "#F6C9D8",
      muted: "#2C2329",
      mutedForeground: "#CFBEC7",
      accent: "#402331",
      accentForeground: "#F3AEC6",
      destructive: "#F0828E",
      destructiveForeground: "#351315",
      border: "#3D3038",
      input: "#3D3038",
      success: "#7CC9A1",
      successBg: "#17382A",
      warning: "#FFD487",
      warningBg: "#3E2B10",
      info: "#ADC9E8",
      infoBg: "#1A2A3D",
    },
  },
  ocean: {
    label: "Ocean",
    light: {
      text: "#182A2D",
      tint: "#267C88",
      background: "#F4FAFA",
      foreground: "#182A2D",
      card: "#FFFFFF",
      cardForeground: "#182A2D",
      primary: "#267C88",
      primaryForeground: "#FFFFFF",
      secondary: "#DDEFF0",
      secondaryForeground: "#315C61",
      muted: "#E9F2F2",
      mutedForeground: "#627479",
      accent: "#E5F3EC",
      accentForeground: "#2D6D56",
      destructive: "#B55252",
      destructiveForeground: "#FFFFFF",
      border: "#D7E6E7",
      input: "#D7E6E7",
      success: "#2E7D62",
      successBg: "#E1F2EA",
      warning: "#A96713",
      warningBg: "#FFF2DA",
      info: "#386B9C",
      infoBg: "#E6F0FA",
    },
    dark: {
      text: "#F4FAFA",
      tint: "#6FC3CF",
      background: "#0F1A1B",
      foreground: "#F4FAFA",
      card: "#182527",
      cardForeground: "#F4FAFA",
      primary: "#6FC3CF",
      primaryForeground: "#082126",
      secondary: "#203638",
      secondaryForeground: "#B8E4E8",
      muted: "#1B2C2E",
      mutedForeground: "#B8C9CC",
      accent: "#18362D",
      accentForeground: "#9BE0C2",
      destructive: "#EE8B8B",
      destructiveForeground: "#2D1111",
      border: "#2B4447",
      input: "#2B4447",
      success: "#80CEAA",
      successBg: "#12382B",
      warning: "#FFD38A",
      warningBg: "#3B2B12",
      info: "#9EC8F0",
      infoBg: "#142D43",
    },
  },
};

export function normalizeColorSchemePreference(
  value: unknown,
): AppColorSchemePreference {
  return APP_COLOR_SCHEME_OPTIONS.some((option) => option.value === value)
    ? (value as AppColorSchemePreference)
    : "system";
}

export function normalizeColorThemePreference(
  value: unknown,
): ColorThemePreference {
  return COLOR_THEME_OPTIONS.some((option) => option.value === value)
    ? (value as ColorThemePreference)
    : "heytelli";
}

export function resolveColorScheme(
  preference: unknown,
  systemScheme: "light" | "dark" | null | undefined,
): ResolvedColorScheme {
  const normalized = normalizeColorSchemePreference(preference);
  if (normalized === "light" || normalized === "dark") return normalized;
  return systemScheme === "dark" ? "dark" : "light";
}

export function resolveColorPalette({
  colorScheme,
  colorTheme,
  systemScheme,
}: {
  colorScheme: unknown;
  colorTheme: unknown;
  systemScheme: "light" | "dark" | null | undefined;
}): ColorPalette {
  const theme = normalizeColorThemePreference(colorTheme);
  const scheme = resolveColorScheme(colorScheme, systemScheme);
  return colorThemes[theme][scheme];
}

const colors = {
  light: colorThemes.heytelli.light,
  dark: colorThemes.heytelli.dark,
  themes: colorThemes,
  radius: 16,
};

export default colors;
