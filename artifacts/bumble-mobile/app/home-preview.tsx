// Alternate home-screen design (preview route: /home-preview).
// Lives alongside the existing app/index.tsx without replacing it, so it can
// be compared in review. Design intent: calmer and lower-density than the
// current dashboard, and deliberately free of person-scoring verdicts — it
// organizes around the user's next clear action, never a judgment of the match.
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
import { formatTimeAgo, formatDateShort } from "@/lib/format";
import { objectPathToUrl } from "@/lib/image";
import {
  getHomeMatchCardModel,
  getFirstName,
  type HomeSignalTone,
} from "@/lib/home-match-card";

type StatusFilter = "active" | "archived" | "ghosted";
type SortKey = "needs" | "recent" | "name";

const SORT_LABELS: Record<SortKey, string> = {
  needs: "Needs you",
  recent: "Recent",
  name: "Name",
};
const SORT_ORDER: SortKey[] = ["needs", "recent", "name"];

function greeting(hour: number): string {
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function lastActivity(m: Match): number {
  return m.lastActivityAt ? new Date(m.lastActivityAt).getTime() : 0;
}

function hasUpcomingDate(m: Match, now: number): boolean {
  if (!m.nextDateAt) return false;
  const t = new Date(m.nextDateAt).getTime();
  return !Number.isNaN(t) && t > now;
}

function needsReview(m: Match): boolean {
  return (
    m.pendingScreenshotCount + m.failedScreenshotCount > 0 ||
    m.analysisFreshness !== "current"
  );
}

// ---------------------------------------------------------------------------
// Focus = the user's next clear action, framed around logistics and the user's
// own reflection — never a verdict or score about the other person.
// ---------------------------------------------------------------------------
type FocusItem = {
  key: string;
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
  matchId: number | null;
};

function buildFocus(active: Match[], now: number): FocusItem[] {
  const items: FocusItem[] = [];

  const review = active.filter(needsReview);
  if (review.length > 0) {
    const only = review.length === 1 ? getFirstName(review[0].name) : null;
    items.push({
      key: "review",
      icon: "image",
      title: only
        ? `New screenshots for ${only}`
        : `${review.length} chats have new screenshots`,
      body: "Bring your read up to date when you have a quiet minute.",
      matchId: review.length === 1 ? review[0].id : null,
    });
  }

  const upcoming = active
    .filter((m) => hasUpcomingDate(m, now))
    .sort(
      (a, b) =>
        new Date(a.nextDateAt as string).getTime() -
        new Date(b.nextDateAt as string).getTime(),
    );
  if (upcoming.length > 0) {
    const next = upcoming[0];
    items.push({
      key: "date",
      icon: "calendar",
      title: `Date with ${getFirstName(next.name)} ${formatDateShort(next.nextDateAt)}`,
      body: "Look back at what you know and set a check-in before you go.",
      matchId: next.id,
    });
  }

  const waiting = active.filter((m) => m.lastSpeaker === "her");
  if (waiting.length > 0) {
    const only = waiting.length === 1 ? getFirstName(waiting[0].name) : null;
    items.push({
      key: "waiting",
      icon: "message-circle",
      title: only
        ? `${only} is waiting on a reply`
        : `${waiting.length} waiting on a reply`,
      body: "No rush. Re-read it first, then answer the way you want to.",
      matchId: waiting.length === 1 ? waiting[0].id : null,
    });
  }

  return items.slice(0, 3);
}

export default function HomeScreenPreview() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, isLoading, refetch, isRefetching, error } = useListMatches();
  const [filter, setFilter] = useState<StatusFilter>("active");
  const [sort, setSort] = useState<SortKey>("needs");

  const matchData = useMemo<Match[]>(
    () => (Array.isArray(data) ? data : []),
    [data],
  );

  const counts = useMemo(() => {
    const acc = { active: 0, archived: 0, ghosted: 0 };
    matchData.forEach((m) => {
      if (m.status in acc) acc[m.status as StatusFilter] += 1;
    });
    return acc;
  }, [matchData]);

  const now = Date.now();
  const activeMatches = useMemo(
    () => matchData.filter((m) => m.status === "active"),
    [matchData],
  );
  const focus = useMemo(
    () => buildFocus(activeMatches, now),
    [activeMatches, now],
  );

  const rows = useMemo(() => {
    const list = matchData.filter((m) => m.status === filter);
    list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "recent") return lastActivity(b) - lastActivity(a);
      const rank =
        getHomeMatchCardModel(b).attentionRank -
        getHomeMatchCardModel(a).attentionRank;
      return rank || lastActivity(b) - lastActivity(a);
    });
    return list;
  }, [matchData, filter, sort]);

  const cycleSort = () => {
    Haptics.selectionAsync().catch(() => {});
    const i = SORT_ORDER.indexOf(sort);
    setSort(SORT_ORDER[(i + 1) % SORT_ORDER.length]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + (Platform.OS === "web" ? 56 : 10),
          paddingHorizontal: 20,
          paddingBottom: 4,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text
              style={{
                fontSize: 12,
                fontFamily: "Inter_600SemiBold",
                letterSpacing: 0,
                textTransform: "uppercase",
                color: c.mutedForeground,
              }}
            >
              HeyTelli
            </Text>
            <H1 style={{ marginTop: 4 }}>{greeting(new Date().getHours())}</H1>
            <Body muted style={{ marginTop: 2 }}>
              {counts.active > 0
                ? `${counts.active} ${counts.active === 1 ? "connection" : "connections"} you're keeping clear on`
                : "A calm place to think it through"}
            </Body>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <IconButton
              icon="message-circle"
              hint="Talk it through"
              onPress={() => router.push("/chat")}
            />
            <Link href="/add" asChild>
              <Pressable
                accessibilityLabel="Add a connection"
                onPress={() => Haptics.selectionAsync().catch(() => {})}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  height: 42,
                  paddingHorizontal: 15,
                  borderRadius: 21,
                  backgroundColor: c.primary,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Feather name="plus" size={18} color={c.primaryForeground} />
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

        {/* Filter + sort */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 18,
          }}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingRight: 12 }}
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
                label="Quiet"
                active={filter === "ghosted"}
                onPress={() => setFilter("ghosted")}
                count={counts.ghosted}
              />
            )}
          </ScrollView>
          <Pressable
            onPress={cycleSort}
            hitSlop={8}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Feather name="sliders" size={13} color={c.mutedForeground} />
            <Text
              style={{
                fontSize: 12,
                fontFamily: "Inter_500Medium",
                color: c.mutedForeground,
              }}
            >
              {SORT_LABELS[sort]}
            </Text>
          </Pressable>
        </View>
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
              <Skeleton width={52} height={52} style={{ borderRadius: 26 }} />
              <View style={{ flex: 1, gap: 8 }}>
                <Skeleton width="55%" height={15} />
                <Skeleton width="80%" height={12} />
              </View>
            </View>
          ))}
        </View>
      ) : error ? (
        <EmptyState
          icon="cloud-off"
          title="Couldn't load right now"
          hint="Pull down to try again."
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(m) => String(m.id)}
          renderItem={({ item }) => (
            <ConnectionRow
              match={item}
              onPress={() => router.push(`/match/${item.id}`)}
            />
          )}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 24),
            gap: 10,
          }}
          ListHeaderComponent={
            filter === "active" ? (
              <View style={{ gap: 12, marginBottom: 4 }}>
                <FocusCard items={focus} onChat={() => router.push("/chat")} />
                {activeMatches.length === 0 && <ShareIntakeCard />}
                <StaleNudgesSection />
                <AutoArchiveBanner onChange={() => refetch()} />
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
                filter === "active" ? "No connections yet" : "Nothing here"
              }
              hint={
                filter === "active"
                  ? "Share a screenshot from your dating app to start your first private read."
                  : `Connections you mark as ${filter === "ghosted" ? "quiet" : filter} show up here.`
              }
              action={
                filter === "active"
                  ? {
                      label: "Add a connection",
                      onPress: () => router.push("/add"),
                    }
                  : undefined
              }
            />
          }
        />
      )}
    </View>
  );
}

function FocusCard({
  items,
  onChat,
}: {
  items: FocusItem[];
  onChat: () => void;
}) {
  const c = useColors();
  const router = useRouter();

  return (
    <View
      style={{
        borderRadius: c.radius,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.card,
        padding: 16,
        gap: 14,
      }}
    >
      <View>
        <Text
          style={{
            fontSize: 18,
            fontFamily: "Inter_700Bold",
            color: c.foreground,
          }}
        >
          {items.length > 0 ? "Where to look first" : "You're all caught up"}
        </Text>
        <Text
          style={{
            fontSize: 13,
            lineHeight: 18,
            color: c.mutedForeground,
            marginTop: 2,
          }}
        >
          {items.length > 0
            ? "A gentle nudge — nothing here is urgent."
            : "Nothing needs you right now. Enjoy the quiet."}
        </Text>
      </View>

      {items.map((item) => (
        <Pressable
          key={item.key}
          disabled={item.matchId == null}
          onPress={() => {
            if (item.matchId == null) return;
            Haptics.selectionAsync().catch(() => {});
            router.push(`/match/${item.matchId}`);
          }}
          style={({ pressed }) => ({
            flexDirection: "row",
            gap: 12,
            alignItems: "flex-start",
            borderRadius: 12,
            backgroundColor: c.background,
            borderWidth: 1,
            borderColor: c.border,
            padding: 12,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: c.secondary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name={item.icon} size={16} color={c.secondaryForeground} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              style={{
                fontSize: 14,
                fontFamily: "Inter_600SemiBold",
                color: c.foreground,
              }}
            >
              {item.title}
            </Text>
            <Text
              style={{ fontSize: 12, lineHeight: 17, color: c.mutedForeground }}
            >
              {item.body}
            </Text>
          </View>
        </Pressable>
      ))}

      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          onChat();
        }}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Feather name="message-circle" size={15} color={c.primary} />
        <Text
          style={{
            fontSize: 13,
            fontFamily: "Inter_600SemiBold",
            color: c.primary,
          }}
        >
          Talk something through with HeyTelli
        </Text>
      </Pressable>
    </View>
  );
}

function ShareIntakeCard() {
  const c = useColors();
  const steps = ["Open Photos", "Tap Share", "Choose HeyTelli"];
  return (
    <View
      style={{
        borderRadius: c.radius,
        backgroundColor: c.secondary,
        borderWidth: 1,
        borderColor: c.border,
        padding: 16,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: c.card,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name="share" size={18} color={c.secondaryForeground} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 15,
              fontFamily: "Inter_700Bold",
              color: c.secondaryForeground,
            }}
          >
            Start from a screenshot
          </Text>
          <Text
            style={{
              fontSize: 12,
              lineHeight: 17,
              color: c.secondaryForeground,
            }}
          >
            Share a profile or chat straight from Photos — it becomes a private
            read.
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
        {steps.map((step, i) => (
          <View
            key={step}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              paddingHorizontal: 9,
              paddingVertical: 5,
              borderRadius: 999,
              backgroundColor: c.card,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontFamily: "Inter_700Bold",
                color: c.primary,
              }}
            >
              {i + 1}
            </Text>
            <Text style={{ fontSize: 12, color: c.secondaryForeground }}>
              {step}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function toneStyle(tone: HomeSignalTone, c: ReturnType<typeof useColors>) {
  switch (tone) {
    case "success":
      return { bg: c.successBg, fg: c.success };
    case "warning":
      return { bg: c.warningBg, fg: c.warning };
    case "danger":
      return { bg: c.destructive + "1A", fg: c.destructive };
    case "primary":
      return { bg: c.secondary, fg: c.secondaryForeground };
    default:
      return { bg: c.muted, fg: c.mutedForeground };
  }
}

function ConnectionRow({
  match,
  onPress,
}: {
  match: Match;
  onPress: () => void;
}) {
  const c = useColors();
  const model = getHomeMatchCardModel(match);
  const photo = objectPathToUrl(match.photoObjectPath);
  const status = toneStyle(model.status.tone, c);
  const waiting = match.pendingScreenshotCount + match.failedScreenshotCount;

  // Neutral one-line read — the user's saved read or a factual profile line.
  // Deliberately avoids surfacing any score or verdict about the person.
  const profileLine = [
    match.extractedProfile.job,
    match.extractedProfile.location,
  ]
    .filter(Boolean)
    .join(" · ");
  const read =
    match.lastRead?.body?.trim() ||
    match.extractedProfile.conversationTone?.trim() ||
    profileLine ||
    "No read yet — add a screenshot to begin.";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${model.name}. ${model.status.label}. ${model.nextAction}`}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => ({
        backgroundColor: c.card,
        borderWidth: 1,
        borderColor: c.border,
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
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: c.muted,
            }}
            contentFit="cover"
          />
        ) : (
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: c.secondary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: c.secondaryForeground,
                fontSize: 18,
                fontFamily: "Inter_700Bold",
              }}
            >
              {model.name.slice(0, 1).toUpperCase()}
            </Text>
          </View>
        )}
        {waiting > 0 && (
          <View
            style={{
              position: "absolute",
              top: -2,
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
              }}
            >
              {waiting}
            </Text>
          </View>
        )}
      </View>

      <View style={{ flex: 1, gap: 5 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            justifyContent: "space-between",
          }}
        >
          <Text
            style={{
              flex: 1,
              fontSize: 16,
              fontFamily: "Inter_600SemiBold",
              color: c.foreground,
            }}
            numberOfLines={1}
          >
            {model.name}
          </Text>
          <View
            style={{
              backgroundColor: status.bg,
              borderRadius: 999,
              paddingHorizontal: 9,
              paddingVertical: 3,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontFamily: "Inter_600SemiBold",
                color: status.fg,
              }}
            >
              {model.status.label}
            </Text>
          </View>
        </View>

        <Text
          style={{ fontSize: 13, lineHeight: 18, color: c.mutedForeground }}
          numberOfLines={2}
        >
          {read}
        </Text>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginTop: 1,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              flex: 1,
            }}
          >
            <Feather name="arrow-right-circle" size={13} color={c.primary} />
            <Text
              style={{
                flex: 1,
                fontSize: 12,
                fontFamily: "Inter_500Medium",
                color: c.foreground,
              }}
              numberOfLines={1}
            >
              {model.nextAction}
            </Text>
          </View>
          {match.lastActivityAt && (
            <Text style={{ fontSize: 11, color: c.mutedForeground }}>
              {formatTimeAgo(match.lastActivityAt)}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}
