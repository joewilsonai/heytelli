import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import {
  updateMatch,
  useGetAutoArchiveCandidates,
} from "@workspace/api-client-react";

export function AutoArchiveBanner({ onChange }: { onChange: () => void }) {
  const c = useColors();
  const router = useRouter();
  const { data, refetch } = useGetAutoArchiveCandidates();
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [actingId, setActingId] = useState<number | null>(null);

  const items = (data ?? []).filter((d) => !dismissed.has(d.matchId));
  if (items.length === 0) return null;

  const first = items[0];

  const archive = async (status: "archived" | "ghosted") => {
    setActingId(first.matchId);
    try {
      await updateMatch(first.matchId, { status });
      await refetch();
      onChange();
    } catch (e: any) {
      Alert.alert("Couldn't update", e?.message ?? "Try again.");
    } finally {
      setActingId(null);
    }
  };

  const dismiss = () => {
    setDismissed((s) => new Set(s).add(first.matchId));
  };

  return (
    <View
      style={{
        marginHorizontal: 20,
        marginBottom: 10,
        backgroundColor: c.card,
        borderColor: c.warning,
        borderWidth: 1,
        borderRadius: c.radius,
        padding: 12,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Feather name="archive" size={14} color={c.warning} />
        <Text style={{ fontSize: 12, color: c.warning, fontFamily: "Inter_600SemiBold" }}>
          AUTO-ARCHIVE SUGGESTION
        </Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={dismiss} hitSlop={8}>
          <Feather name="x" size={14} color={c.mutedForeground} />
        </Pressable>
      </View>
      <Pressable onPress={() => router.push(`/match/${first.matchId}`)}>
        <Text style={{ color: c.foreground, fontSize: 14, fontFamily: "Inter_600SemiBold" }}>
          {first.name}
        </Text>
        <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 2 }}>
          {first.reason}
        </Text>
      </Pressable>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable
          onPress={() => archive("archived")}
          disabled={actingId === first.matchId}
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: c.muted,
            alignItems: "center",
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: c.foreground, fontSize: 13, fontFamily: "Inter_500Medium" }}>
            Archive
          </Text>
        </Pressable>
        <Pressable
          onPress={() => archive("ghosted")}
          disabled={actingId === first.matchId}
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: c.muted,
            alignItems: "center",
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: c.foreground, fontSize: 13, fontFamily: "Inter_500Medium" }}>
            Mark ghosted
          </Text>
        </Pressable>
      </View>
      {items.length > 1 && (
        <Text style={{ color: c.mutedForeground, fontSize: 11 }}>
          +{items.length - 1} more cold match{items.length - 1 > 1 ? "es" : ""}
        </Text>
      )}
    </View>
  );
}
