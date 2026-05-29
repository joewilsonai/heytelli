import { Feather } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useGetWeeklyDebrief } from "@workspace/api-client-react";

import { Card, EmptyState, H1, SectionLabel, Skeleton } from "@/components/ui";

const STATUS_META: Record<string, { label: string; tint: string; icon: any }> =
  {
    heating_up: { label: "Heating up", tint: "#10B981", icon: "trending-up" },
    cold: { label: "Cold", tint: "#3B82F6", icon: "cloud-snow" },
    needs_attention: {
      label: "Needs attention",
      tint: "#F59E0B",
      icon: "alert-circle",
    },
    deprioritize: {
      label: "Deprioritize",
      tint: "#9CA3AF",
      icon: "arrow-down",
    },
    steady: { label: "Steady", tint: "#6B7280", icon: "minus" },
  };

export default function WeeklyDebriefScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, isLoading, error, refetch, isRefetching } =
    useGetWeeklyDebrief();

  return (
    <>
      <Stack.Screen
        options={{ headerTintColor: c.foreground, title: "Weekly debrief" }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: c.background }}
        contentContainerStyle={{
          paddingTop: insets.top + 50,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 20),
          gap: 14,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <H1>Sunday debrief</H1>
          <Pressable onPress={() => refetch()} hitSlop={8}>
            {isRefetching ? (
              <ActivityIndicator size="small" color={c.primary} />
            ) : (
              <Feather name="refresh-cw" size={18} color={c.primary} />
            )}
          </Pressable>
        </View>
        {isLoading ? (
          <>
            <Skeleton height={120} />
            <Skeleton height={180} />
          </>
        ) : error || !data ? (
          <EmptyState
            icon="alert-triangle"
            title="Couldn't load debrief"
            hint="Pull-to-refresh."
            action={{ label: "Retry", onPress: () => refetch() }}
          />
        ) : (
          <>
            <Card>
              <Text
                style={{
                  fontSize: 11,
                  color: c.primary,
                  fontWeight: "600",
                  textTransform: "uppercase",
                  letterSpacing: 0,
                }}
              >
                {data.headline}
              </Text>
              <Text
                style={{
                  color: c.foreground,
                  fontSize: 14,
                  marginTop: 8,
                  lineHeight: 20,
                }}
              >
                {data.summary}
              </Text>
              <View style={{ flexDirection: "row", gap: 16, marginTop: 12 }}>
                <View>
                  <Text
                    style={{
                      fontSize: 11,
                      color: c.mutedForeground,
                      textTransform: "uppercase",
                    }}
                  >
                    Active
                  </Text>
                  <Text
                    style={{
                      fontSize: 22,
                      fontWeight: "700",
                      color: c.foreground,
                    }}
                  >
                    {data.totalActive}
                  </Text>
                </View>
                <View>
                  <Text
                    style={{
                      fontSize: 11,
                      color: c.mutedForeground,
                      textTransform: "uppercase",
                    }}
                  >
                    New this week
                  </Text>
                  <Text
                    style={{
                      fontSize: 22,
                      fontWeight: "700",
                      color: c.foreground,
                    }}
                  >
                    {data.newThisWeek}
                  </Text>
                </View>
              </View>
            </Card>

            {data.recommendations.length > 0 && (
              <Card>
                <SectionLabel>This week's actions</SectionLabel>
                <View style={{ gap: 8, marginTop: 8 }}>
                  {data.recommendations.map((r, i) => (
                    <View key={i} style={{ flexDirection: "row", gap: 8 }}>
                      <Text style={{ color: c.primary, fontWeight: "700" }}>
                        {i + 1}.
                      </Text>
                      <Text
                        style={{
                          color: c.foreground,
                          fontSize: 13,
                          flex: 1,
                          lineHeight: 19,
                        }}
                      >
                        {r}
                      </Text>
                    </View>
                  ))}
                </View>
              </Card>
            )}

            {data.matches.length > 0 && (
              <Card>
                <SectionLabel>Per match</SectionLabel>
                <View style={{ gap: 8, marginTop: 8 }}>
                  {data.matches.map((m) => {
                    const meta = STATUS_META[m.status] ?? STATUS_META.steady;
                    return (
                      <Pressable
                        key={m.matchId}
                        onPress={() => router.push(`/match/${m.matchId}`)}
                        style={({ pressed }) => ({
                          padding: 10,
                          borderRadius: 10,
                          borderLeftWidth: 3,
                          borderLeftColor: meta.tint,
                          backgroundColor: c.muted,
                          opacity: pressed ? 0.75 : 1,
                        })}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <Feather
                            name={meta.icon}
                            size={12}
                            color={meta.tint}
                          />
                          <Text
                            style={{
                              color: meta.tint,
                              fontSize: 11,
                              fontWeight: "600",
                              textTransform: "uppercase",
                            }}
                          >
                            {meta.label}
                          </Text>
                          <View style={{ flex: 1 }} />
                          <Text
                            style={{
                              color: c.foreground,
                              fontSize: 13,
                              fontWeight: "600",
                            }}
                          >
                            {m.name}
                          </Text>
                        </View>
                        <Text
                          style={{
                            color: c.mutedForeground,
                            fontSize: 12,
                            marginTop: 4,
                          }}
                        >
                          {m.reason}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}
