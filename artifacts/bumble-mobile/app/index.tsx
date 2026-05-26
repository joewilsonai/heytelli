import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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
} from "@/components/ui";
import { StaleNudgesSection } from "@/components/StaleNudgesSection";
import { AutoArchiveBanner } from "@/components/AutoArchiveBanner";
import { formatTimeAgo } from "@/lib/format";
import {
  getHomeDailyBriefModel,
  getHomeMatchCardModel,
  getHomeTrendSnapshot,
  type HomeBriefItem,
  type HomeTrendSnapshot,
  type HomeSignalTone,
} from "@/lib/home-match-card";

type StatusFilter = "active" | "archived" | "ghosted";
type SortKey = "recent" | "attention" | "name" | "connection" | "momentum";

const SORT_LABELS: Record<SortKey, string> = {
  recent: "Recent",
  attention: "Needs attention",
  name: "Name",
  connection: "Connection",
  momentum: "Momentum",
};

function scoreOf(m: Match, key: SortKey): number {
  switch (key) {
    case "connection":
      return m.extractedProfile.scores.chemistry.value ?? -1;
    case "momentum":
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
  const [sort, setSort] = useState<SortKey>("attention");
  const [sortOpen, setSortOpen] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const matchData = useMemo<Match[]>(
    () => (Array.isArray(data) ? data : []),
    [data],
  );

  const allTags = useMemo(() => {
    const s = new Set<string>();
    matchData.forEach((m) => (m.tags ?? []).forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [matchData]);

  const counts = useMemo(() => {
    const c = { active: 0, archived: 0, ghosted: 0 };
    matchData.forEach((m) => {
      c[m.status as StatusFilter] = (c[m.status as StatusFilter] ?? 0) + 1;
    });
    return c;
  }, [matchData]);

  const matches = useMemo(() => {
    const list = matchData.filter(
      (m) =>
        m.status === filter &&
        (!tagFilter || (m.tags ?? []).includes(tagFilter)),
    );
    list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "recent") return lastActivity(b) - lastActivity(a);
      if (sort === "attention") {
        const rank =
          getHomeMatchCardModel(b).attentionRank -
          getHomeMatchCardModel(a).attentionRank;
        return rank || lastActivity(b) - lastActivity(a);
      }
      return scoreOf(b, sort) - scoreOf(a, sort);
    });
    return list;
  }, [matchData, filter, sort, tagFilter]);

  const dailyBrief = useMemo(
    () => getHomeDailyBriefModel(matchData),
    [matchData],
  );
  const trendSnapshot = useMemo(
    () => getHomeTrendSnapshot(matchData),
    [matchData],
  );

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
          <View style={{ flex: 1 }}>
            <H1>HeyTelli</H1>
            <Body muted style={{ marginTop: 2 }}>
              Your private dating bestie · {counts.active} active
            </Body>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Link href="/trust" asChild>
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
                accessibilityLabel="Trust Center"
              >
                <Feather name="shield" size={20} color={c.foreground} />
              </Pressable>
            </Link>
            <Link href="/settings" asChild>
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
                accessibilityLabel="My dating OS"
              >
                <Feather name="settings" size={20} color={c.foreground} />
              </Pressable>
            </Link>
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
                accessibilityLabel="HeyTelli chat"
              >
                <Feather name="message-circle" size={20} color={c.foreground} />
              </Pressable>
            </Link>
            <Link href="/add" asChild>
              <Pressable
                onPress={() => Haptics.selectionAsync().catch(() => {})}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  height: 44,
                  paddingHorizontal: 14,
                  borderRadius: 22,
                  backgroundColor: c.primary,
                  opacity: pressed ? 0.7 : 1,
                  shadowColor: "#000",
                  shadowOpacity: 0.15,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 3,
                })}
                accessibilityLabel="Add match"
              >
                <Feather name="plus" size={20} color={c.primaryForeground} />
                <Text
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 14,
                    color: c.primaryForeground,
                  }}
                >
                  Add
                </Text>
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

        {allTags.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: 8, marginHorizontal: -20 }}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 6 }}
          >
            <Chip
              label="All tags"
              active={tagFilter === null}
              onPress={() => setTagFilter(null)}
            />
            {allTags.map((t) => (
              <Chip
                key={t}
                label={`#${t}`}
                active={tagFilter === t}
                onPress={() => setTagFilter(tagFilter === t ? null : t)}
              />
            ))}
          </ScrollView>
        )}

        {/* Sort row */}
        <View
          style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}
        >
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
                {sort === k && (
                  <Feather name="check" size={16} color={c.primary} />
                )}
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
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 20),
            gap: 10,
          }}
          ListHeaderComponent={
            filter === "active" ? (
              <View style={{ marginHorizontal: -20, marginBottom: 12 }}>
                <HomeBriefCard brief={dailyBrief} trend={trendSnapshot} />
                <ShareSheetOnboardingCard />
                <AutoArchiveBanner onChange={() => refetch()} />
                <StaleNudgesSection />
              </View>
            ) : null
          }
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
              title={
                filter === "active" ? "No matches yet" : `No ${filter} matches`
              }
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

function HomeBriefCard({
  brief,
  trend,
}: {
  brief: ReturnType<typeof getHomeDailyBriefModel>;
  trend: HomeTrendSnapshot;
}) {
  const c = useColors();
  const trendColors = toneColors(trend.tone, c);

  return (
    <View
      style={{
        marginHorizontal: 20,
        marginBottom: 12,
        borderRadius: c.radius,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.card,
        padding: 16,
        gap: 14,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: c.secondary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name="star" size={19} color={c.secondaryForeground} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text
            style={{
              color: c.foreground,
              fontSize: 20,
              fontFamily: "Inter_700Bold",
            }}
          >
            {brief.headline}
          </Text>
          <Text
            style={{
              color: c.mutedForeground,
              fontSize: 13,
              lineHeight: 18,
            }}
          >
            {brief.body}
          </Text>
        </View>
      </View>
      <View style={{ gap: 8 }}>
        {brief.items.length > 0 ? (
          brief.items.map((item) => (
            <BriefItemRow key={item.body} item={item} />
          ))
        ) : (
          <View
            style={{
              borderRadius: 12,
              backgroundColor: c.muted,
              padding: 12,
              flexDirection: "row",
              gap: 10,
              alignItems: "center",
            }}
          >
            <Feather name="check-circle" size={18} color={c.success} />
            <Text
              style={{
                color: c.foreground,
                fontSize: 13,
                lineHeight: 18,
                flex: 1,
              }}
            >
              Nothing is yelling for attention. Very civilized of everyone.
            </Text>
          </View>
        )}
      </View>
      <View
        style={{
          borderRadius: 12,
          borderWidth: 1,
          borderColor: trendColors.border,
          backgroundColor: trendColors.bg,
          padding: 12,
          gap: 4,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          <Feather name="activity" size={14} color={trendColors.fg} />
          <Text
            style={{
              color: trendColors.fg,
              fontSize: 12,
              fontFamily: "Inter_700Bold",
            }}
          >
            {trend.title}
          </Text>
        </View>
        <Text
          style={{ color: c.foreground, fontSize: 13, lineHeight: 18 }}
          numberOfLines={3}
        >
          {trend.body}
        </Text>
      </View>
    </View>
  );
}

function BriefItemRow({ item }: { item: HomeBriefItem }) {
  const c = useColors();
  const colors = toneColors(item.tone, c);
  return (
    <View
      style={{
        borderRadius: 12,
        backgroundColor: c.background,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 11,
        flexDirection: "row",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: colors.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather name={briefIcon(item)} size={15} color={colors.fg} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
          <Text
            style={{
              color: c.foreground,
              fontSize: 13,
              fontFamily: "Inter_700Bold",
              flex: 1,
            }}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text
            style={{
              color: colors.fg,
              fontSize: 11,
              fontFamily: "Inter_700Bold",
            }}
            numberOfLines={1}
          >
            {item.matchName}
          </Text>
        </View>
        <Text
          style={{ color: c.mutedForeground, fontSize: 12, lineHeight: 17 }}
          numberOfLines={2}
        >
          {item.body}
        </Text>
      </View>
    </View>
  );
}

function briefIcon(item: HomeBriefItem): keyof typeof Feather.glyphMap {
  switch (item.actionKind) {
    case "review_screenshots":
    case "add_screenshots":
      return "image";
    case "make_date_card":
    case "share_date_card":
      return "calendar";
    case "review_pattern":
      return "alert-circle";
    case "review_reply":
      return "message-circle";
    case "decide_next_move":
      return "shuffle";
    case "wait":
      return "clock";
  }
}

function ShareSheetOnboardingCard() {
  const c = useColors();
  const steps = ["Open Photos", "Tap Share", "Choose HeyTelli"];

  return (
    <View
      style={{
        marginHorizontal: 20,
        marginBottom: 12,
        backgroundColor: c.foreground,
        borderWidth: 1,
        borderColor: c.foreground,
        borderRadius: c.radius,
        padding: 16,
        gap: 13,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: "rgba(255,255,255,0.14)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name="upload-cloud" size={20} color={c.background} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text
            style={{
              color: c.background,
              fontSize: 18,
              fontFamily: "Inter_700Bold",
            }}
          >
            Add screenshots
          </Text>
          <Text
            style={{
              color: c.background,
              opacity: 0.78,
              fontSize: 12,
              lineHeight: 17,
            }}
          >
            Import a profile or chat and turn it into a private read, patterns,
            and a plan.
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
        {steps.map((step, index) => (
          <View
            key={step}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              paddingHorizontal: 9,
              paddingVertical: 5,
              borderRadius: 999,
              backgroundColor: "rgba(255,255,255,0.12)",
            }}
          >
            <Text
              style={{
                color: c.background,
                opacity: 0.72,
                fontSize: 11,
                fontFamily: "Inter_700Bold",
              }}
            >
              {index + 1}
            </Text>
            <Text style={{ color: c.background, fontSize: 12 }}>{step}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Link href="/add" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Import screenshots"
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 42,
              borderRadius: 12,
              backgroundColor: c.background,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 6,
              opacity: pressed ? 0.78 : 1,
            })}
          >
            <Feather name="plus" size={16} color={c.foreground} />
            <Text
              style={{
                color: c.foreground,
                fontSize: 13,
                fontFamily: "Inter_700Bold",
              }}
            >
              Import
            </Text>
          </Pressable>
        </Link>
        <Link href="/trust" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Trust Center"
            style={({ pressed }) => ({
              minHeight: 42,
              paddingHorizontal: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.22)",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 6,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Feather name="lock" size={14} color={c.background} />
            <Text
              style={{
                color: c.background,
                fontSize: 12,
                fontFamily: "Inter_600SemiBold",
              }}
            >
              Privacy
            </Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

function MatchRow({ match, onPress }: { match: Match; onPress: () => void }) {
  const c = useColors();
  const model = getHomeMatchCardModel(match);
  const isStale =
    model.signal.label === "Stale" || model.status.label === "Needs reply";
  const actionColors = toneColors(model.primaryAction.tone, c);
  const profileLine = [
    match.extractedProfile.job,
    match.extractedProfile.location,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Pressable
      accessibilityLabel={`${model.name}: ${model.primaryAction.label}`}
      accessibilityRole="button"
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => ({
        backgroundColor: c.card,
        borderWidth: 1,
        borderColor: isStale ? c.warning : actionColors.border,
        borderRadius: c.radius,
        padding: 14,
        flexDirection: "row",
        gap: 12,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: actionColors.bg,
            borderWidth: 1,
            borderColor: actionColors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: actionColors.fg,
              fontSize: 18,
              fontFamily: "Inter_700Bold",
            }}
          >
            {model.name.slice(0, 1).toUpperCase()}
          </Text>
        </View>
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
        {match.analysisFreshness !== "current" &&
          match.pendingScreenshotCount + match.failedScreenshotCount > 0 && (
            <View
              style={{
                position: "absolute",
                bottom: -2,
                right: -2,
                minWidth: 18,
                height: 18,
                paddingHorizontal: 5,
                borderRadius: 9,
                backgroundColor: c.warning,
                borderWidth: 2,
                borderColor: c.card,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: "#fff",
                  fontSize: 10,
                  fontFamily: "Inter_700Bold",
                  lineHeight: 12,
                }}
              >
                {match.pendingScreenshotCount + match.failedScreenshotCount}
              </Text>
            </View>
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
              fontSize: 17,
              fontFamily: "Inter_600SemiBold",
              color: c.foreground,
              flex: 1,
            }}
            numberOfLines={1}
          >
            {model.name}
          </Text>
          <DashboardPill label={model.status.label} tone={model.status.tone} />
        </View>
        <Text
          style={{
            fontSize: 12,
            fontFamily: "Inter_400Regular",
            color: c.mutedForeground,
          }}
          numberOfLines={1}
        >
          {profileLine || formatTimeAgo(match.lastActivityAt)}
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 7,
            marginTop: 4,
          }}
        >
          <DashboardPill label={model.signal.label} tone={model.signal.tone} />
          <View
            style={{
              flex: 1,
              minWidth: 0,
              borderRadius: 999,
              backgroundColor: actionColors.bg,
              borderWidth: 1,
              borderColor: actionColors.border,
              paddingHorizontal: 9,
              paddingVertical: 4,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                color: actionColors.fg,
                fontFamily: "Inter_600SemiBold",
              }}
              numberOfLines={1}
            >
              {model.primaryAction.label}
            </Text>
          </View>
        </View>
        <View
          style={{
            backgroundColor: c.muted,
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 8,
            gap: 5,
            marginTop: 3,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                color: c.mutedForeground,
                fontFamily: "Inter_600SemiBold",
                textTransform: "uppercase",
              }}
              numberOfLines={1}
            >
              {model.read.title}
            </Text>
            <DashboardPill
              label={model.read.freshnessLabel}
              tone={model.read.tone}
            />
          </View>
          <Text
            style={{
              color: c.foreground,
              fontSize: 12,
              lineHeight: 17,
              fontFamily: "Inter_400Regular",
            }}
            numberOfLines={2}
          >
            {model.read.body}
          </Text>
        </View>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 6,
            marginTop: 5,
          }}
        >
          {model.contextChips.map((chip) => (
            <ContextChip key={chip} label={chip} />
          ))}
          {match.lastActivityAt && profileLine && (
            <Text
              style={{
                fontSize: 11,
                color: c.mutedForeground,
                paddingVertical: 3,
              }}
            >
              {formatTimeAgo(match.lastActivityAt)}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function toneColors(
  tone: HomeSignalTone,
  c: ReturnType<typeof useColors>,
): { bg: string; fg: string; border: string } {
  if (tone === "success") {
    return { bg: c.successBg, fg: c.success, border: c.success + "44" };
  }
  if (tone === "warning") {
    return { bg: c.warningBg, fg: c.warning, border: c.warning + "44" };
  }
  if (tone === "danger") {
    return {
      bg: c.destructive + "12",
      fg: c.destructive,
      border: c.destructive + "44",
    };
  }
  if (tone === "primary") {
    return { bg: c.secondary, fg: c.secondaryForeground, border: c.border };
  }
  return { bg: c.muted, fg: c.mutedForeground, border: c.border };
}

function DashboardPill({
  label,
  tone,
}: {
  label: string;
  tone: HomeSignalTone;
}) {
  const c = useColors();
  const colors = toneColors(tone, c);
  return (
    <View
      style={{
        backgroundColor: colors.bg,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 3,
        alignSelf: "flex-start",
      }}
    >
      <Text
        style={{
          color: colors.fg,
          fontSize: 11,
          fontFamily: "Inter_600SemiBold",
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

function ContextChip({ label }: { label: string }) {
  const c = useColors();
  return (
    <View
      style={{
        backgroundColor: c.muted,
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 3,
      }}
    >
      <Text style={{ fontSize: 11, color: c.mutedForeground }}>{label}</Text>
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
