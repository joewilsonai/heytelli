import { Platform } from "react-native";

export const displayFontFamily = Platform.select({
  ios: "Georgia",
  android: "serif",
  default: "Georgia",
});

