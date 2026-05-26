import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { getCheatSheet, getRedFlagRadar } from "@workspace/api-client-react";
import type {
  CheatSheetReply,
  RedFlagRadarResult,
} from "@workspace/api-client-react";

import { Body, Card, SectionLabel } from "./ui";

const STYLE_META: Record<
  CheatSheetReply["style"],
  { label: string; icon: any; tint: string }
> = {
  playful: { label: "Playful", icon: "smile", tint: "#A16207" },
  curious: { label: "Curious", icon: "help-circle", tint: "#1D4ED8" },
  direct: { label: "Direct", icon: "arrow-right", tint: "#15803D" },
};

type FlagGate = { flags: RedFlagRadarResult; tooHot: boolean };

export function CheatSheetCard({ matchId }: { matchId: number }) {
  const c = useColors();
  const [replies, setReplies] = useState<CheatSheetReply[] | null>(null);
  const [gate, setGate] = useState<FlagGate | null>(null);
  const [loading, setLoading] = useState(false);
  const [override, setOverride] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      // Safety-first: peek at saved patterns before suggesting replies.
      const flags = await getRedFlagRadar(matchId);
      const highCount = flags.redFlags.filter(
        (f) => f.severity === "high",
      ).length;
      const totalCount = flags.redFlags.length;
      const tooHot = highCount >= 1 || totalCount >= 2;
      setGate({ flags, tooHot });
      if (tooHot && !override) {
        setReplies(null);
        return;
      }
      const r = await getCheatSheet(matchId);
      setReplies(r.replies);
    } catch (e: any) {
      Alert.alert("Couldn't generate", e?.message ?? "Try again.");
    } finally {
      setLoading(false);
    }
  };

  const generateAnyway = async () => {
    setOverride(true);
    setLoading(true);
    try {
      const r = await getCheatSheet(matchId);
      setReplies(r.replies);
    } catch (e: any) {
      Alert.alert("Couldn't generate", e?.message ?? "Try again.");
    } finally {
      setLoading(false);
    }
  };

  const copy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );
  };

  const showCoolingOff = gate?.tooHot && !replies;

  return (
    <Card>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <SectionLabel>
          {showCoolingOff ? "Sleep on it" : "Reply options"}
        </SectionLabel>
        <Pressable onPress={run} disabled={loading} hitSlop={8}>
          {loading ? (
            <ActivityIndicator size="small" color={c.primary} />
          ) : (
            <Feather
              name={replies || gate ? "refresh-cw" : "zap"}
              size={16}
              color={c.primary}
            />
          )}
        </Pressable>
      </View>

      {!gate && !replies && (
        <Body muted style={{ fontSize: 12, marginTop: 4 }}>
          We'll check for patterns first, then suggest a reply only if it feels
          right.
        </Body>
      )}

      {showCoolingOff && gate && (
        <View style={{ marginTop: 10, gap: 10 }}>
          <View
            style={{
              padding: 12,
              borderRadius: 10,
              backgroundColor: c.destructive + "12",
              borderWidth: 1,
              borderColor: c.destructive + "55",
              gap: 6,
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Feather name="alert-octagon" size={14} color={c.destructive} />
              <Text
                style={{
                  color: c.destructive,
                  fontSize: 12,
                  fontFamily: "Inter_700Bold",
                  letterSpacing: 0.5,
                }}
              >
                {gate.flags.redFlags.length} PATTERN
                {gate.flags.redFlags.length === 1 ? "" : "S"} — TAKE A BEAT
              </Text>
            </View>
            <Text style={{ color: c.foreground, fontSize: 13, lineHeight: 18 }}>
              {gate.flags.overallRead ||
                "Worth re-reading the thread before you reply. You don't owe him a fast answer."}
            </Text>
            <View style={{ gap: 2, marginTop: 4 }}>
              {gate.flags.redFlags.slice(0, 3).map((f, i) => (
                <Text key={i} style={{ color: c.foreground, fontSize: 12 }}>
                  • {f.label}
                </Text>
              ))}
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={generateAnyway}
              disabled={loading}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: c.border,
                alignItems: "center",
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
                Show replies anyway
              </Text>
            </Pressable>
          </View>
          <Text
            style={{
              color: c.mutedForeground,
              fontSize: 10,
              fontStyle: "italic",
              textAlign: "center",
            }}
          >
            Not replying is also a reply.
          </Text>
        </View>
      )}

      {replies && (
        <View style={{ marginTop: 10, gap: 8 }}>
          {gate?.tooHot && (
            <View
              style={{
                padding: 8,
                borderRadius: 8,
                backgroundColor: c.warningBg,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Feather name="alert-triangle" size={12} color={c.warning} />
              <Text style={{ color: c.warning, fontSize: 11, flex: 1 }}>
                Heads up — patterns above. Don't feel obligated to send
                anything.
              </Text>
            </View>
          )}
          {replies.map((r, i) => {
            const meta = STYLE_META[r.style];
            return (
              <Pressable
                key={i}
                onPress={() => copy(r.text)}
                style={({ pressed }) => ({
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: c.muted,
                  borderWidth: 1,
                  borderColor: c.border,
                  opacity: pressed ? 0.7 : 1,
                  gap: 6,
                })}
              >
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <Feather name={meta.icon} size={12} color={meta.tint} />
                  <Text
                    style={{
                      fontSize: 11,
                      color: meta.tint,
                      fontFamily: "Inter_600SemiBold",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    {meta.label}
                  </Text>
                  <View style={{ flex: 1 }} />
                  <Feather name="copy" size={12} color={c.mutedForeground} />
                </View>
                <Text style={{ color: c.foreground, fontSize: 14 }}>
                  {r.text}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </Card>
  );
}
