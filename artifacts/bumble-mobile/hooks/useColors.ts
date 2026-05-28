import { useColorScheme } from "react-native";

import colors, {
  resolveColorPalette,
  type ColorPalette,
} from "@/constants/colors";
import { useUserSettings } from "@/lib/use-user-settings";

type ColorTokens = ColorPalette & { radius: typeof colors.radius };

/**
 * Returns the design tokens for the current color scheme.
 *
 * The returned object contains all color tokens for the active palette
 * plus scheme-independent values like `radius`.
 *
 * Uses the saved Settings appearance preference when present, and otherwise
 * follows the device appearance setting.
 */
export function useColors(): ColorTokens {
  const systemScheme = useColorScheme();
  const { settings } = useUserSettings();
  const palette = resolveColorPalette({
    colorScheme: settings.appearance.colorScheme,
    colorTheme: settings.appearance.colorTheme,
    systemScheme,
  });
  return { ...palette, radius: colors.radius };
}
