import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";

import { useColors } from "@/hooks/useColors";
import { displayFontFamily } from "@/constants/typography";

type MatchStatus = "active" | "archived" | "ghosted";
type ColorToken = Exclude<keyof ReturnType<typeof useColors>, "radius">;

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}) {
  const c = useColors();
  return (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderRadius: c.radius,
          borderWidth: 1,
          borderColor: c.border,
          padding: 16,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: "600",
        color: c.mutedForeground,
        letterSpacing: 0,
        textTransform: "uppercase",
        marginBottom: 10,
      }}
    >
      {children}
    </Text>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  loading,
  disabled,
  small,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: keyof typeof Feather.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: ViewStyle;
}) {
  const c = useColors();
  const bg =
    variant === "primary"
      ? c.primary
      : variant === "secondary"
        ? c.secondary
        : variant === "destructive"
          ? c.destructive
          : "transparent";
  const fg =
    variant === "primary"
      ? c.primaryForeground
      : variant === "secondary"
        ? c.secondaryForeground
        : variant === "destructive"
          ? c.destructiveForeground
          : c.foreground;
  const borderColor = variant === "ghost" ? c.border : "transparent";
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      onPress={() => {
        if (isDisabled) return;
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          minHeight: 44,
          borderRadius: c.radius - 4,
          borderWidth: variant === "ghost" ? 1 : 0,
          borderColor,
          paddingVertical: small ? 8 : 12,
          paddingHorizontal: small ? 12 : 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          opacity: isDisabled ? 0.5 : pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : icon ? (
        <Feather name={icon} size={small ? 14 : 16} color={fg} />
      ) : null}
      <Text
        style={{
          color: fg,
          fontSize: small ? 13 : 15,
          fontWeight: "700",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  color,
  size = 22,
  hint,
}: {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  color?: string;
  size?: number;
  hint?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityLabel={hint ?? icon}
      accessibilityRole="button"
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      hitSlop={10}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.5 : 1,
      })}
    >
      <Feather name={icon} size={size} color={color ?? c.foreground} />
    </Pressable>
  );
}

const STATUS_STYLES: Record<
  MatchStatus,
  {
    bg: ColorToken;
    fg: ColorToken;
    label: string;
    icon: keyof typeof Feather.glyphMap;
  }
> = {
  active: { bg: "successBg", fg: "success", label: "Active", icon: "circle" },
  archived: {
    bg: "muted",
    fg: "mutedForeground",
    label: "Archived",
    icon: "archive",
  },
  ghosted: {
    bg: "accent",
    fg: "accentForeground",
    label: "Ghosted",
    icon: "moon",
  },
};

export function StatusPill({
  status,
  small,
}: {
  status: MatchStatus;
  small?: boolean;
}) {
  const c = useColors();
  const s = STATUS_STYLES[status];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: c[s.bg],
        paddingHorizontal: small ? 6 : 8,
        paddingVertical: small ? 2 : 4,
        borderRadius: 999,
      }}
    >
      <Feather name={s.icon} size={small ? 9 : 11} color={c[s.fg]} />
      <Text
        style={{
          fontSize: small ? 10 : 11,
          fontWeight: "600",
          color: c[s.fg],
        }}
      >
        {s.label}
      </Text>
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  count,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  count?: number;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(active) }}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        minHeight: 44,
        backgroundColor: active ? c.foreground : c.card,
        borderWidth: 1,
        borderColor: active ? c.foreground : c.border,
        borderRadius: 999,
        paddingVertical: 7,
        paddingHorizontal: 12,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: active ? c.background : c.foreground,
        }}
      >
        {label}
      </Text>
      {typeof count === "number" && (
        <View
          style={{
            backgroundColor: active ? c.background : c.muted,
            paddingHorizontal: 6,
            paddingVertical: 1,
            borderRadius: 999,
            minWidth: 18,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontSize: 10,
              fontWeight: "600",
              color: active ? c.foreground : c.mutedForeground,
            }}
          >
            {count}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function VibeTag({ label }: { label: string }) {
  const c = useColors();
  return (
    <View
      style={{
        backgroundColor: c.secondary,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: "500",
          color: c.secondaryForeground,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export function ScoreBar({
  label,
  value,
  max = 10,
}: {
  label: string;
  value: number | null | undefined;
  max?: number;
}) {
  const c = useColors();
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value / max));
  const color =
    value == null
      ? c.muted
      : pct >= 0.75
        ? c.success
        : pct >= 0.5
          ? c.warning
          : c.destructive;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text
          style={{
            fontSize: 12,
            fontWeight: "500",
            color: c.mutedForeground,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "600",
            color: c.foreground,
          }}
        >
          {value == null ? "—" : `${value}/${max}`}
        </Text>
      </View>
      <View
        style={{
          height: 6,
          backgroundColor: c.muted,
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${pct * 100}%`,
            height: "100%",
            backgroundColor: color,
          }}
        />
      </View>
    </View>
  );
}

export function Skeleton({
  height = 16,
  width = "100%",
  style,
}: {
  height?: number;
  width?: number | `${number}%`;
  style?: ViewStyle;
}) {
  const c = useColors();
  return (
    <View
      style={[
        {
          height,
          width,
          backgroundColor: c.muted,
          borderRadius: 8,
        },
        style,
      ]}
    />
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  hint?: string;
  action?: { label: string; onPress: () => void };
}) {
  const c = useColors();
  return (
    <View style={{ alignItems: "center", paddingVertical: 48, gap: 12 }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: c.muted,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather name={icon} size={24} color={c.mutedForeground} />
      </View>
      <Text
        style={{
          fontSize: 16,
          fontWeight: "600",
          color: c.foreground,
        }}
      >
        {title}
      </Text>
      {hint ? (
        <Text
          style={{
            fontSize: 13,
            fontWeight: "400",
            color: c.mutedForeground,
            textAlign: "center",
            maxWidth: 280,
          }}
        >
          {hint}
        </Text>
      ) : null}
      {action ? (
        <Button label={action.label} onPress={action.onPress} small />
      ) : null}
    </View>
  );
}

export function H1({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: TextStyle;
}) {
  const c = useColors();
  return (
    <Text
      style={[
        {
          fontSize: 28,
          fontFamily: displayFontFamily,
          fontWeight: "600",
          color: c.foreground,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function H2({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: TextStyle;
}) {
  const c = useColors();
  return (
    <Text
      style={[
        {
          fontSize: 20,
          fontFamily: displayFontFamily,
          fontWeight: "600",
          color: c.foreground,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Body({
  children,
  muted,
  style,
  selectable,
}: {
  children: React.ReactNode;
  muted?: boolean;
  style?: TextStyle;
  selectable?: boolean;
}) {
  const c = useColors();
  return (
    <Text
      selectable={selectable}
      style={[
        {
          fontSize: 14,
          fontWeight: "400",
          color: muted ? c.mutedForeground : c.foreground,
          lineHeight: 20,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export const uiStyles = StyleSheet.create({
  rowGap: { gap: 12 },
});
