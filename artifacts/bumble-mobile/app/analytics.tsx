import { Feather } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import React from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useGetFunnelStats } from "@workspace/api-client-react";

import { Card, EmptyState, H1, SectionLabel, Skeleton } from "@/components/ui";

export default function AnalyticsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, isLoading, error } = useGetFunnelStats();

  const maxCount = data ? Math.max(1, ...data.stages.map((s) => s.count)) : 1;

  return (
    <>
      <Stack.Screen options={{ headerTintColor: c.foreground, title: "Analytics" }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: c.background }}
        contentContainerStyle={{
          paddingTop: insets.top + 50,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 20),
          gap: 14,
        }}
      >
        <H1>Pipeline</H1>
        {isLoading ? (
          <>
            <Skeleton height={200} />
            <Skeleton height={140} />
          </>
        ) : error || !data ? (
          <EmptyState icon="bar-chart-2" title="Couldn't load analytics" />
        ) : (
          <>
            <Card>
              <SectionLabel>Conversion funnel</SectionLabel>
              <View style={{ gap: 10, marginTop: 10 }}>
                {data.stages.map((s, i) => {
                  const pct = (s.count / maxCount) * 100;
                  const topPct =
                    i === 0
                      ? 100
                      : Math.round(
                          (s.count / Math.max(1, data.stages[0].count)) * 100,
                        );
                  return (
                    <View key={s.label} style={{ gap: 4 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={{ color: c.foreground, fontSize: 13, fontWeight: "500" }}>
                          {s.label}
                        </Text>
                        <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
                          {s.count} {i > 0 && `(${topPct}%)`}
                        </Text>
                      </View>
                      <View
                        style={{
                          height: 10,
                          borderRadius: 5,
                          backgroundColor: c.muted,
                          overflow: "hidden",
                        }}
                      >
                        <View
                          style={{
                            width: `${pct}%`,
                            height: "100%",
                            backgroundColor: c.primary,
                          }}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            </Card>
            <Card>
              <SectionLabel>Totals</SectionLabel>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 10 }}>
                {[
                  ["All matches", data.totals.matches],
                  ["Active", data.totals.active],
                  ["Archived", data.totals.archived],
                  ["Ghosted", data.totals.ghosted],
                  ["Date scheduled", data.totals.withDateScheduled],
                  ["Date completed", data.totals.withDateCompleted],
                ].map(([label, val]) => (
                  <View key={label as string} style={{ minWidth: 120, gap: 2 }}>
                    <Text style={{ fontSize: 10, color: c.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      {label}
                    </Text>
                    <Text style={{ fontSize: 22, fontWeight: "700", color: c.foreground }}>
                      {val}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
            <Pressable
              onPress={() => router.push("/weekly")}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 14,
                backgroundColor: c.primary,
                borderRadius: c.radius,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Feather name="calendar" size={18} color={c.primaryForeground} />
                <Text style={{ color: c.primaryForeground, fontWeight: "600" }}>
                  Weekly debrief
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={c.primaryForeground} />
            </Pressable>
          </>
        )}
      </ScrollView>
    </>
  );
}
