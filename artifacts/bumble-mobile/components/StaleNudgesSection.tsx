import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useGetStaleNudges } from "@workspace/api-client-react";

import { objectPathToUrl } from "@/lib/image";
import { useLocalMatchPhotos } from "@/lib/local-match-photos";

export function StaleNudgesSection() {
  const c = useColors();
  const router = useRouter();
  const { data } = useGetStaleNudges();
  const { photos: localMatchPhotos } = useLocalMatchPhotos();
  const nudges = Array.isArray(data) ? data : [];

  if (nudges.length === 0) return null;

  return (
    <View style={{ paddingHorizontal: 20, marginTop: 8, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Feather name="zap" size={14} color={c.warning} />
        <Text
          style={{
            fontSize: 11,
            fontWeight: "600",
            color: c.mutedForeground,
            letterSpacing: 1.2,
            textTransform: "uppercase",
          }}
        >
          Re-engage ({nudges.length})
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: "row", gap: 12, paddingRight: 20 }}>
          {nudges.map((nudge) => {
            const photo =
              localMatchPhotos[String(nudge.matchId)] ??
              objectPathToUrl(nudge.photoObjectPath);
            const opener = nudge.openers[0] ?? "";
            return (
              <View
                key={nudge.matchId}
                style={{
                  width: 260,
                  backgroundColor: c.card,
                  borderWidth: 1,
                  borderColor: c.border,
                  borderRadius: 14,
                  padding: 12,
                  gap: 8,
                }}
              >
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    router.push(`/match/${nudge.matchId}`);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  {photo ? (
                    <Image
                      source={photo}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: c.muted,
                      }}
                      contentFit="cover"
                    />
                  ) : (
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: c.muted,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Feather
                        name="user"
                        size={16}
                        color={c.mutedForeground}
                      />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontWeight: "600",
                        color: c.foreground,
                        fontSize: 14,
                      }}
                    >
                      {nudge.name}
                    </Text>
                    <Text style={{ fontSize: 11, color: c.mutedForeground }}>
                      Quiet for {formatHours(nudge.hoursSinceLastReply)}
                    </Text>
                  </View>
                </Pressable>
                <Text
                  style={{
                    fontSize: 13,
                    color: c.foreground,
                    lineHeight: 18,
                  }}
                  numberOfLines={3}
                >
                  "{opener}"
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    onPress={() => {
                      Clipboard.setStringAsync(opener).catch(() => {});
                      Haptics.notificationAsync(
                        Haptics.NotificationFeedbackType.Success,
                      ).catch(() => {});
                    }}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      gap: 4,
                      alignItems: "center",
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: c.border,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Feather name="copy" size={11} color={c.foreground} />
                    <Text style={{ fontSize: 11, color: c.foreground }}>
                      Copy
                    </Text>
                  </Pressable>
                  {nudge.openers.length > 1 && (
                    <Pressable
                      onPress={() => router.push(`/match/${nudge.matchId}`)}
                      style={({ pressed }) => ({
                        flexDirection: "row",
                        gap: 4,
                        alignItems: "center",
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 999,
                        backgroundColor: c.muted,
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <Text style={{ fontSize: 11, color: c.foreground }}>
                        +{nudge.openers.length - 1} more
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function formatHours(h: number): string {
  if (h < 48) return `${Math.round(h)}h`;
  const days = Math.round(h / 24);
  return `${days}d`;
}
