import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Link, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useListMatches } from "@workspace/api-client-react";
import type { Match } from "@workspace/api-client-react";

import {
  Body,
  Chip,
  EmptyState,
  H1,
  IconButton,
  Skeleton,
  StatusPill,
  VibeTag,
} from "@/components/ui";
import { formatTimeAgo } from "@/lib/format";
import { objectPathToUrl } from "@/lib/image";

type StatusFilter = "active" | "archived" | "ghosted";
type SortKey = "recent" | "name" | "chemistry" | "sex" | "conversion";

const SORT_LABELS: Record<SortKey, string> = {
  recent: "Recent",
  name: "Name",
  chemistry: "Chemistry",
  sex: "Sex potential",
  conversion: "Conversion",
};

function scoreOf(m: Match, key: SortKey): number {
  switch (key) {
    case "chemistry":
      return m.extractedProfile.scores.chemistry.value ?? -1;
    case "sex":
      return m.extractedProfile.scores.sexPotential.value ?? -1;
    case "conversion":
      return m.extractedProfile.scores.conversionAbility.value ?? -1;
    default:
      return 0;
  }
}

function lastActivity(m: Match): number {
  return m.lastActivityAt ? new Date(m.lastActivityAt).getTime() : 0;
}

export default function MatchesScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, isLoading, refetch, isRefetching, error } = useListMatches();
  const [filter, setFilter] = useState<StatusFilter>("active");
  const [sort, setSort] = useState<SortKey>("recent");
  const [sortOpen, setSortOpen] = useState(false);

  const counts = useMemo(() => {
    const c = { active: 0, archived: 0, ghosted: 0 };
    (data ?? []).forEach((m) => {
      c[m.status as StatusFilter] = (c[m.status as StatusFilter] ?? 0) + 1;
    });
    return c;
  }, [data]);

  const matches = useMemo(() => {
    const list = (data ?? []).filter((m) => m.status === filter);
    list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "recent") return lastActivity(b) - lastActivity(a);
      return scoreOf(b, sort) - scoreOf(a, sort);
    });
    return list;
  }, [data, filter, sort]);

  const renderRow = ({ item }: { item: Match }) => (
    <MatchRow match={item} onPress={() => router.push(`/match/${item.id}`)} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + (Platform.OS === "web" ? 60 : 8),
          paddingHorizontal: 20,
          paddingBottom: 8,
          backgroundColor: c.background,
        }}
      >
        <View style={styles.headerRow}>
          <View>
            <H1>Matches</H1>
            <Body muted style={{ marginTop: 2 }}>
              {(data ?? []).length} total · {counts.active} active
            </Body>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Link href="/chat" asChild>
              <Pressable
                onPress={() => Haptics.selectionAsync().catch(() => {})}
                style={({ pressed }) => ({
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: c.card,
                  borderWidth: 1,
                  borderColor: c.border,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.7 : 1,
                })}
                accessibilityLabel="Wingman chat"
              >
                <Feather name="message-circle" size={20} color={c.foreground} />
              </Pressable>
            </Link>
            <Link href="/add" asChild>
              <Pressable
                onPress={() => Haptics.selectionAsync().catch(() => {})}
                style={({ pressed }) => ({
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: c.primary,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.7 : 1,
                  shadowColor: "#000",
                  shadowOpacity: 0.1,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 3,
                })}
                accessibilityLabel="Add match"
              >
                <Feather name="plus" size={24} color={c.primaryForeground} />
              </Pressable>
            </Link>
          </View>
        </View>

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 16, marginHorizontal: -20 }}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
        >
          <Chip
            label="Active"
            active={filter === "active"}
            onPress={() => setFilter("active")}
            count={counts.active}
          />
          {counts.archived > 0 && (
            <Chip
              label="Archived"
              active={filter === "archived"}
              onPress={() => setFilter("archived")}
              count={counts.archived}
            />
          )}
          {counts.ghosted > 0 && (
            <Chip
              label="Ghosted"
              active={filter === "ghosted"}
              onPress={() => setFilter("ghosted")}
              count={counts.ghosted}
            />
          )}
        </ScrollView>

        {/* Sort row */}
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setSortOpen((v) => !v);
            }}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Feather name="bar-chart-2" size={14} color={c.mutedForeground} />
            <Text
              style={{
                fontSize: 13,
                color: c.mutedForeground,
                fontFamily: "Inter_500Medium",
              }}
            >
              Sort: {SORT_LABELS[sort]}
            </Text>
            <Feather
              name={sortOpen ? "chevron-up" : "chevron-down"}
              size={14}
              color={c.mutedForeground}
            />
          </Pressable>
        </View>
        {sortOpen && (
          <View
            style={{
              marginTop: 8,
              backgroundColor: c.card,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: c.border,
              overflow: "hidden",
            }}
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k, i) => (
              <Pressable
                key={k}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setSort(k);
                  setSortOpen(false);
                }}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: c.border,
                  backgroundColor: pressed ? c.muted : "transparent",
                })}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontFamily: "Inter_500Medium",
                    color: c.foreground,
                  }}
                >
                  {SORT_LABELS[k]}
                </Text>
                {sort === k && <Feather name="check" size={16} color={c.primary} />}
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {isLoading ? (
        <View style={{ padding: 20, gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={{
                backgroundColor: c.card,
                borderWidth: 1,
                borderColor: c.border,
                borderRadius: c.radius,
                padding: 14,
                flexDirection: "row",
                gap: 12,
              }}
            >
              <Skeleton width={56} height={56} style={{ borderRadius: 28 }} />
              <View style={{ flex: 1, gap: 8 }}>
                <Skeleton width="60%" height={16} />
                <Skeleton width="40%" height={12} />
              </View>
            </View>
          ))}
        </View>
      ) : error ? (
        <EmptyState
          icon="alert-triangle"
          title="Couldn't load matches"
          hint="Pull to retry."
        />
      ) : (
        <FlatList
          data={matches}
          keyExtractor={(m) => String(m.id)}
          renderItem={renderRow}
          contentContainerStyle={{
            padding: 20,
            paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 20),
            gap: 10,
          }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => refetch()}
              tintColor={c.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="heart"
              title={filter === "active" ? "No matches yet" : `No ${filter} matches`}
              hint={
                filter === "active"
                  ? "Tap the + button to add your first match from a screenshot."
                  : "Matches you mark as " + filter + " will appear here."
              }
              action={
                filter === "active"
                  ? { label: "Add match", onPress: () => router.push("/add") }
                  : undefined
              }
            />
          }
        />
      )}
    </View>
  );
}

function MatchRow({ match, onPress }: { match: Match; onPress: () => void }) {
  const c = useColors();
  const photo = objectPathToUrl(match.photoObjectPath);
  const scores = match.extractedProfile.scores;
  const isStale =
    match.status === "active" &&
    match.lastSpeaker === "her" &&
    match.lastActivityAt &&
    Date.now() - new Date(match.lastActivityAt).getTime() > 1000 * 60 * 60 * 48;

  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => ({
        backgroundColor: c.card,
        borderWidth: 1,
        borderColor: isStale ? c.warning : c.border,
        borderRadius: c.radius,
        padding: 14,
        flexDirection: "row",
        gap: 12,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View>
        {photo ? (
          <Image
            source={photo}
            style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.muted }}
            contentFit="cover"
            transition={150}
          />
        ) : (
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
            <Feather name="user" size={22} color={c.mutedForeground} />
          </View>
        )}
        {isStale && (
          <View
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              width: 14,
              height: 14,
              borderRadius: 7,
              backgroundColor: c.warning,
              borderWidth: 2,
              borderColor: c.card,
            }}
          />
        )}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            justifyContent: "space-between",
          }}
        >
          <Text
            style={{
              fontSize: 16,
              fontFamily: "Inter_600SemiBold",
              color: c.foreground,
              flex: 1,
            }}
            numberOfLines={1}
          >
            {match.name}
          </Text>
          {match.status !== "active" && <StatusPill status={match.status} small />}
        </View>
        <Text
          style={{
            fontSize: 12,
            fontFamily: "Inter_400Regular",
            color: c.mutedForeground,
          }}
          numberOfLines={1}
        >
          {match.extractedProfile.job ?? "—"}
          {match.extractedProfile.location ? ` · ${match.extractedProfile.location}` : ""}
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginTop: 2,
          }}
        >
          <ScoreChip label="Sex" value={scores.sexPotential.value} />
          <ScoreChip label="Conv" value={scores.conversionAbility.value} />
          <ScoreChip label="Chem" value={scores.chemistry.value} />
          <View style={{ flex: 1 }} />
          <Text style={{ fontSize: 11, color: c.mutedForeground }}>
            {formatTimeAgo(match.lastActivityAt)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function ScoreChip({ label, value }: { label: string; value: number | null }) {
  const c = useColors();
  const color =
    value == null
      ? c.mutedForeground
      : value >= 8
        ? c.success
        : value >= 5
          ? c.warning
          : c.destructive;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
      <Text style={{ fontSize: 10, color: c.mutedForeground }}>{label}</Text>
      <Text
        style={{
          fontSize: 12,
          fontFamily: "Inter_600SemiBold",
          color,
        }}
      >
        {value ?? "—"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
});
