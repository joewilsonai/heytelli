import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { getRedFlagRadar } from "@workspace/api-client-react";
import type { RedFlagRadarResult } from "@workspace/api-client-react";

import { Body, Card, SectionLabel } from "./ui";

export function RedFlagsCard({ matchId }: { matchId: number }) {
  const c = useColors();
  const [data, setData] = useState<RedFlagRadarResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const r = await getRedFlagRadar(matchId);
      setData(r);
      setOpen(true);
    } catch (e: any) {
      Alert.alert("Couldn't analyze", e?.message ?? "Try again.");
    } finally {
      setLoading(false);
    }
  };

  const sevColor = (s: "low" | "medium" | "high") =>
    s === "high" ? c.destructive : s === "medium" ? c.warning : c.mutedForeground;

  return (
    <Card>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <SectionLabel>Red flag radar</SectionLabel>
        <Pressable
          onPress={data ? () => setOpen((v) => !v) : run}
          disabled={loading}
          hitSlop={8}
        >
          {loading ? (
            <ActivityIndicator size="small" color={c.primary} />
          ) : (
            <Feather
              name={data ? (open ? "chevron-up" : "chevron-down") : "zap"}
              size={18}
              color={c.primary}
            />
          )}
        </Pressable>
      </View>
      {!data && (
        <Body muted style={{ fontSize: 12, marginTop: 4 }}>
          Scan chat, dates, and notes for behavioral patterns.
        </Body>
      )}
      {data && open && (
        <View style={{ marginTop: 10, gap: 12 }}>
          {data.overallRead ? (
            <View style={{ padding: 10, backgroundColor: c.muted, borderRadius: 10 }}>
              <Text style={{ color: c.foreground, fontSize: 13, fontStyle: "italic" }}>
                "{data.overallRead}"
              </Text>
            </View>
          ) : null}
          {data.redFlags.length > 0 && (
            <View style={{ gap: 6 }}>
              <Text
                style={{
                  fontSize: 12,
                  color: c.destructive,
                  fontFamily: "Inter_600SemiBold",
                }}
              >
                RED FLAGS
              </Text>
              {data.redFlags.map((f, i) => (
                <View key={i} style={{ gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: sevColor(f.severity),
                      }}
                    />
                    <Text style={{ color: c.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>
                      {f.label}
                    </Text>
                  </View>
                  <Text style={{ color: c.mutedForeground, fontSize: 12, marginLeft: 14 }}>
                    {f.evidence}
                  </Text>
                </View>
              ))}
            </View>
          )}
          {data.greenFlags.length > 0 && (
            <View style={{ gap: 6 }}>
              <Text
                style={{
                  fontSize: 12,
                  color: c.success,
                  fontFamily: "Inter_600SemiBold",
                }}
              >
                GREEN FLAGS
              </Text>
              {data.greenFlags.map((f, i) => (
                <View key={i} style={{ gap: 2 }}>
                  <Text style={{ color: c.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>
                    {f.label}
                  </Text>
                  <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{f.evidence}</Text>
                </View>
              ))}
            </View>
          )}
          <Pressable onPress={run} disabled={loading} hitSlop={8}>
            <Text style={{ color: c.primary, fontSize: 12, fontFamily: "Inter_500Medium" }}>
              Re-analyze
            </Text>
          </Pressable>
        </View>
      )}
    </Card>
  );
}
