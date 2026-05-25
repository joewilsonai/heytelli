import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { getCheatSheet } from "@workspace/api-client-react";
import type { CheatSheetReply } from "@workspace/api-client-react";

import { Body, Card, SectionLabel } from "./ui";

const STYLE_META: Record<CheatSheetReply["style"], { label: string; icon: any; tint: string }> = {
  playful: { label: "Playful", icon: "smile", tint: "#F59E0B" },
  curious: { label: "Curious", icon: "help-circle", tint: "#3B82F6" },
  direct: { label: "Direct", icon: "arrow-right", tint: "#EF4444" },
};

export function CheatSheetCard({ matchId }: { matchId: number }) {
  const c = useColors();
  const [replies, setReplies] = useState<CheatSheetReply[] | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
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
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  return (
    <Card>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <SectionLabel>Cheat sheet</SectionLabel>
        <Pressable onPress={run} disabled={loading} hitSlop={8}>
          {loading ? (
            <ActivityIndicator size="small" color={c.primary} />
          ) : (
            <Feather name={replies ? "refresh-cw" : "zap"} size={16} color={c.primary} />
          )}
        </Pressable>
      </View>
      {!replies && (
        <Body muted style={{ fontSize: 12, marginTop: 4 }}>
          3 quick replies — playful, curious, direct.
        </Body>
      )}
      {replies && (
        <View style={{ marginTop: 10, gap: 8 }}>
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
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
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
                <Text style={{ color: c.foreground, fontSize: 14 }}>{r.text}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </Card>
  );
}
