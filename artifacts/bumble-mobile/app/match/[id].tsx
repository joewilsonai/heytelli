import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  Share,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import {
  addScreenshot,
  createChatConversation,
  deleteMatch,
  generateDateBrief,
  getGetMatchQueryKey,
  getListMatchesQueryKey,
  getListChatConversationsQueryKey,
  rescoreMatch,
  updateMatch,
  useGetMatch,
} from "@workspace/api-client-react";
import type {
  DateHistoryEntry,
  DateSafetyPlanInput,
  MatchDetail,
  MatchTimelineEvent,
  MatchStatus,
} from "@workspace/api-client-react";

import {
  Body,
  Button,
  Card,
  EmptyState,
  IconButton,
  SectionLabel,
  Skeleton,
  StatusPill,
  VibeTag,
} from "@/components/ui";
import { FeedbackSheet } from "@/components/FeedbackSheet";
import { VoiceDebriefSheet } from "@/components/VoiceDebriefSheet";
import { VoiceNoteFeedbackSheet } from "@/components/VoiceNoteFeedbackSheet";
import { InPersonRecordingSheet } from "@/components/InPersonRecordingSheet";
import { GutCheckCard } from "@/components/GutCheckCard";
import { RedFlagsCard } from "@/components/RedFlagsCard";
import { DatingPatternGlossaryCard } from "@/components/DatingPatternGlossaryCard";
import { CheatSheetCard } from "@/components/CheatSheetCard";
import { TagsRow } from "@/components/TagsRow";
import { TagHistoryCard } from "@/components/TagHistoryCard";
import { ResponseStatsCard } from "@/components/ResponseStatsCard";
import { addDateToCalendar } from "@/lib/calendar";
import {
  cancelDateDayReminder,
  cancelDateSafetyReminders,
  scheduleDateDayReminder,
  scheduleDateSafetyReminders,
} from "@/lib/notifications";
import { formatDateTime, formatTimeAgo, isPast } from "@/lib/format";
import { objectPathToUrl } from "@/lib/image";
import {
  submitImprovementFeedback,
  type FeedbackType,
} from "@/lib/improvement-feedback";
import {
  buildDateCardMessage,
  buildCircleCheckMessage,
  buildSoftExitMessage,
  getDateSafetyChecklistProgress,
  getDateSafetyPlanStatus,
  getCoverModeLabel,
  getDateModeStatusLabel,
  SAFE_DATE_CHECKLIST_ITEMS,
  type CircleCheckStatus,
  type CoverModeTheme,
  type DateSafetyPlan,
  type DateModeStatus,
  type SafeDateChecklist,
} from "@/lib/date-safety-plan";
import {
  COVER_QUICK_ACTIONS,
  getCoverQuickAction,
  type CoverQuickActionId,
} from "@/lib/date-mode-cover-actions";
import {
  DATE_PLAN_TEMPLATES,
  buildDatePlanFromTemplate,
  type DatePlanTemplate,
} from "@/lib/date-plan-templates";
import { getMatchDetailHeroModel } from "@/lib/match-detail-hero";
import { MAX_SHARED_SCREENSHOTS } from "@/lib/share-intake";
import { uploadImage } from "@/lib/upload";
import { buildDateSafetyPlanFromSettings } from "@/lib/user-settings";
import { useUserSettings } from "@/lib/use-user-settings";
import { useLocalMatchPhotos } from "@/lib/local-match-photos";

export default function MatchDetailScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const matchId = Number(id);
  const [dateCoverRevealed, setDateCoverRevealed] = useState(false);
  const [coverActionBusy, setCoverActionBusy] =
    useState<CoverQuickActionId | null>(null);
  const [errorFeedbackOpen, setErrorFeedbackOpen] = useState(false);
  const { data, isLoading, refetch, isRefetching, error } =
    useGetMatch(matchId);
  const {
    photos: localMatchPhotos,
    setLocalMatchPhoto,
    removeLocalMatchPhoto,
  } = useLocalMatchPhotos();
  const activeDateMode = Boolean(
    data?.dateSafetyPlan &&
    isDateModeActive(data.dateSafetyPlan.dateModeStatus) &&
    !data.dateSafetyPlan.dateModeClosedAt,
  );
  const dateCoverActive = Boolean(
    data?.dateSafetyPlan?.coverModeEnabled && activeDateMode,
  );

  useEffect(() => {
    if (!dateCoverActive) setDateCoverRevealed(false);
  }, [dateCoverActive]);

  const onCoverAction = async (actionId: CoverQuickActionId) => {
    const action = getCoverQuickAction(actionId);
    const plan = data?.dateSafetyPlan;
    if (!data || !action || !plan) return;

    setCoverActionBusy(actionId);
    try {
      let message: string;
      if (
        action.messageIntent === "safe" ||
        action.messageIntent === "completed"
      ) {
        message = buildCircleCheckMessage(data, action.messageIntent);
      } else {
        message = buildSoftExitMessage(data, action.messageIntent);
      }

      const result = await Share.share({ message });
      if (result.action !== Share.sharedAction) return;

      const checkedAt = new Date().toISOString();
      const nextDateModeStatus =
        dateModeStatusForCircle(action.circleStatus) ?? plan.dateModeStatus;
      const nextDateModeClosedAt =
        action.circleStatus === "completed" ? checkedAt : plan.dateModeClosedAt;

      await updateMatch(data.id, {
        dateSafetyPlan: {
          trustedCircleName: plan.trustedCircleName,
          transportPlan: plan.transportPlan,
          checkInAt: plan.checkInAt,
          expectedEndAt: plan.expectedEndAt,
          codeWord: plan.codeWord,
          circleNote: plan.circleNote,
          shareLiveLocation: plan.shareLiveLocation,
          safeDateChecklist: plan.safeDateChecklist,
          circleCheckStatus: action.circleStatus,
          lastCircleCheckAt: checkedAt,
          coverModeEnabled: plan.coverModeEnabled,
          coverModeTheme: plan.coverModeTheme,
          dateModeStatus: nextDateModeStatus,
          dateModeStartedAt: plan.dateModeStartedAt,
          dateModeClosedAt: nextDateModeClosedAt,
        },
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      await refetch();
    } catch (e: any) {
      Alert.alert("Couldn't update circle", e?.message ?? "Try again.");
    } finally {
      setCoverActionBusy(null);
    }
  };

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.background,
          paddingTop: insets.top + 60,
          padding: 20,
          gap: 16,
        }}
      >
        <Stack.Screen options={{ headerTintColor: c.foreground }} />
        <Skeleton height={180} />
        <Skeleton height={120} />
        <Skeleton height={120} />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.background,
          paddingTop: insets.top + 60,
        }}
      >
        <Stack.Screen options={{ headerTintColor: c.foreground }} />
        <EmptyState
          icon="alert-triangle"
          title="Match not found"
          action={{ label: "Go back", onPress: () => router.back() }}
        />
        <View style={{ paddingHorizontal: 20 }}>
          <Button
            label="Tell us what happened"
            icon="message-circle"
            variant="ghost"
            onPress={() => setErrorFeedbackOpen(true)}
          />
        </View>
        <FeedbackSheet
          visible={errorFeedbackOpen}
          surface="match-error"
          onClose={() => setErrorFeedbackOpen(false)}
        />
      </View>
    );
  }

  if (dateCoverActive && !dateCoverRevealed) {
    return (
      <DateModeCoverScreen
        match={data}
        busyAction={coverActionBusy}
        onCoverAction={onCoverAction}
        onOpenPlan={() => setDateCoverRevealed(true)}
      />
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerTintColor: c.foreground }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: c.background }}
        contentContainerStyle={{
          paddingTop: insets.top + 50,
          paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 24),
          paddingHorizontal: 16,
          gap: 14,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={c.primary}
            progressViewOffset={insets.top + 50}
          />
        }
      >
        <HeaderCard
          match={data}
          localPhotoUri={localMatchPhotos[String(data.id)] ?? null}
          setLocalMatchPhoto={setLocalMatchPhoto}
          removeLocalMatchPhoto={removeLocalMatchPhoto}
          onChange={() => refetch()}
        />
        <SectionIntro
          icon="eye"
          title="Read"
          body="The latest read, saved patterns, and what deserves attention before you reply or meet."
        />
        <NextStepCard match={data} />
        <ScreenshotIntakeCard match={data} onChange={() => refetch()} />
        <LatestReadCard match={data} onChange={() => refetch()} />
        <GutCheckCard match={data} onChange={() => refetch()} />
        <RedFlagsCard
          matchId={data.id}
          promoted
          initialSummary={data.redFlagSummary}
          initialRedFlags={{
            redFlags: data.redFlags ?? [],
            currentRedFlags: data.currentRedFlags ?? [],
            historicalRedFlags: data.historicalRedFlags ?? [],
            greenFlags: data.greenFlags ?? [],
            overallRead: data.overallRead ?? "",
          }}
        />
        <SectionIntro
          icon="book-open"
          title="Story"
          body="Trends, receipts, tags, and the timeline of what has happened with this person."
        />
        <StoryOverviewCard match={data} />
        <TimelineCard events={data.timelineEvents ?? []} />
        <DatingPatternGlossaryCard compact />
        <ScreenshotsCard match={data} onChange={() => refetch()} />
        <Pressable
          onPress={() => router.push(`/match/${data.id}/photos`)}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: 10,
            borderRadius: c.radius,
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.card,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Feather name="image" size={14} color={c.foreground} />
          <Text
            style={{
              color: c.foreground,
              fontSize: 13,
              fontWeight: "500",
            }}
          >
            View all {data.screenshots.length} photo
            {data.screenshots.length === 1 ? "" : "s"}
          </Text>
        </Pressable>
        <TranscriptCard match={data} onChange={() => refetch()} />
        <TagsRow
          matchId={data.id}
          tags={data.tags ?? []}
          onChange={() => refetch()}
        />
        <TagHistoryCard matchId={data.id} />
        <NotesCard match={data} onChange={() => refetch()} />
        <SectionIntro
          icon="calendar"
          title="Date"
          body="Plan the date, brief yourself before you go, and keep your circle in the loop."
        />
        {isPast(data.nextDateAt) && data.nextDateAt && !activeDateMode && (
          <PostDateDebriefCard match={data} onChange={() => refetch()} />
        )}
        {data.nextDateAt && (!isPast(data.nextDateAt) || activeDateMode) && (
          <>
            <NextDateCard match={data} onChange={() => refetch()} />
            <DateSafetyPlanCard
              match={data}
              onChange={() => refetch()}
              onHideCover={() => setDateCoverRevealed(false)}
            />
            <BetaFeedbackCard
              matchId={data.id}
              surface="date-card"
              prompt="Would you send this Date Card to a friend?"
            />
          </>
        )}
        {!data.nextDateAt && (
          <ScheduleDateCard match={data} onChange={() => refetch()} />
        )}
        <SectionIntro
          icon="message-circle"
          title="Talk"
          body="Ask Telli, talk out a debrief, check a voice note, or get one careful reply."
        />
        <ChatLinkCard matchId={data.id} matchName={data.name} />
        <VoiceDebriefCard
          matchId={data.id}
          matchName={data.name}
          onApplied={() => refetch()}
        />
        <ToolsRow
          matchId={data.id}
          matchName={data.name}
          onApplied={() => refetch()}
        />
        <ResponseStatsCard matchId={data.id} />
        <CheatSheetCard matchId={data.id} />
        <StatusActionsCard
          match={data}
          onChange={() => refetch()}
          onArchived={() => router.back()}
          onDeleted={() => router.replace("/")}
        />
      </ScrollView>
    </>
  );
}

/* ------------------------------- Cards ----------------------------------- */

function SectionIntro({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
}) {
  const c = useColors();
  return (
    <View
      style={{
        paddingTop: 8,
        paddingHorizontal: 2,
        gap: 5,
        flexDirection: "row",
        alignItems: "flex-start",
      }}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: c.secondary,
          alignItems: "center",
          justifyContent: "center",
          marginTop: 1,
        }}
      >
        <Feather name={icon} size={15} color={c.secondaryForeground} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            color: c.foreground,
            fontSize: 18,
            fontWeight: "700",
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            color: c.mutedForeground,
            fontSize: 12,
            lineHeight: 17,
          }}
        >
          {body}
        </Text>
      </View>
    </View>
  );
}

function StoryOverviewCard({ match }: { match: MatchDetail }) {
  const c = useColors();
  const pending = match.pendingScreenshotCount + match.failedScreenshotCount;
  const savedPatterns =
    (match.redFlagSummary?.currentCount ?? 0) +
    (match.redFlagSummary?.historicalCount ?? 0);
  const highSeverity = match.redFlagSummary?.highSeverityCount ?? 0;
  const events = (match.timelineEvents ?? []).slice().sort((a, b) => {
    return new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
  });
  const latestEvent = events[0];
  const theme = match.tags?.[0] ?? match.vibeTags?.[0] ?? null;
  const tone =
    highSeverity > 0
      ? "danger"
      : savedPatterns > 0 || pending > 0
        ? "warning"
        : "primary";
  const colors = heroToneColors(tone, c);
  const trendTitle =
    savedPatterns > 0
      ? "Saved pattern is part of the story"
      : pending > 0
        ? "New receipts need a refresh"
        : match.dateHistory.length > 0
          ? "You have date history here"
          : theme
            ? `Theme: ${theme}`
            : "The story is still forming";
  const trendBody =
    savedPatterns > 0
      ? `${savedPatterns} saved pattern${savedPatterns === 1 ? "" : "s"} stay visible here even when the next analysis changes.`
      : pending > 0
        ? `${pending} screenshot${pending === 1 ? "" : "s"} can update the read, tags, and timeline when you reanalyze.`
        : latestEvent
          ? `Last saved moment: ${latestEvent.title}.`
          : "Add screenshots, notes, or a debrief to build the private story over time.";
  const freshness =
    match.analysisFreshness === "current"
      ? "Analysis up to date"
      : pending > 0
        ? `${pending} screenshot${pending === 1 ? "" : "s"} waiting`
        : "Refresh when the story changes";
  const stats = [
    {
      label: "Receipts",
      value: String(match.screenshots.length),
    },
    {
      label: "Timeline",
      value: String(events.length),
    },
    {
      label: "Tags",
      value: String(match.tags?.length ?? 0),
    },
  ];

  return (
    <Card style={{ borderColor: colors.border }}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: colors.bg,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name="trending-up" size={20} color={colors.fg} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <SectionLabel>Trend analysis</SectionLabel>
          <Text
            style={{
              color: c.foreground,
              fontSize: 17,
              fontWeight: "700",
            }}
          >
            {trendTitle}
          </Text>
        </View>
      </View>
      <Body muted style={{ marginTop: 10, fontSize: 13, lineHeight: 19 }}>
        {trendBody}
      </Body>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 12,
        }}
      >
        {stats.map((stat) => (
          <View
            key={stat.label}
            style={{
              flexGrow: 1,
              flexBasis: "30%",
              borderRadius: 10,
              backgroundColor: c.background,
              borderWidth: 1,
              borderColor: c.border,
              padding: 9,
              gap: 2,
            }}
          >
            <Text
              style={{
                color: c.mutedForeground,
                fontSize: 10,
                fontWeight: "700",
                textTransform: "uppercase",
              }}
            >
              {stat.label}
            </Text>
            <Text
              style={{
                color: c.foreground,
                fontSize: 16,
                fontWeight: "700",
                fontVariant: ["tabular-nums"],
              }}
            >
              {stat.value}
            </Text>
          </View>
        ))}
      </View>
      <View
        style={{
          marginTop: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          alignSelf: "flex-start",
          borderRadius: 999,
          backgroundColor: colors.bg,
          paddingHorizontal: 9,
          paddingVertical: 5,
        }}
      >
        <Feather name="refresh-cw" size={11} color={colors.fg} />
        <Text
          style={{
            color: colors.fg,
            fontSize: 11,
            fontWeight: "700",
          }}
        >
          {freshness}
        </Text>
      </View>
    </Card>
  );
}

function VoiceDebriefCard({
  matchId,
  matchName,
  onApplied,
}: {
  matchId: number;
  matchName: string;
  onApplied: () => void;
}) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          setOpen(true);
        }}
        style={({ pressed }) => ({
          backgroundColor: c.card,
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: c.radius,
          padding: 14,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: c.primary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name="mic" size={18} color={c.primaryForeground} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: "600",
              color: c.foreground,
            }}
          >
            Voice debrief
          </Text>
          <Text
            style={{ fontSize: 12, color: c.mutedForeground, marginTop: 2 }}
          >
            Talk it out — saves transcript, tags, read, and signals
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color={c.mutedForeground} />
      </Pressable>
      <VoiceDebriefSheet
        visible={open}
        matchId={matchId}
        matchName={matchName}
        onClose={() => setOpen(false)}
        onApplied={onApplied}
      />
    </>
  );
}

function ToolsRow({
  matchId,
  matchName,
  onApplied,
}: {
  matchId: number;
  matchName: string;
  onApplied: () => void;
}) {
  const c = useColors();
  const [voiceNote, setVoiceNote] = useState(false);
  const [inPerson, setInPerson] = useState(false);
  return (
    <>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setVoiceNote(true);
          }}
          style={({ pressed }) => ({
            flex: 1,
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: c.radius,
            padding: 12,
            gap: 6,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: c.warning,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="headphones" size={16} color="#fff" />
          </View>
          <Text
            style={{
              fontWeight: "600",
              color: c.foreground,
              fontSize: 13,
            }}
          >
            Voice note check
          </Text>
          <Text style={{ fontSize: 11, color: c.mutedForeground }}>
            Critique before you send
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setInPerson(true);
          }}
          style={({ pressed }) => ({
            flex: 1,
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: c.radius,
            padding: 12,
            gap: 6,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: c.foreground,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="radio" size={16} color={c.background} />
          </View>
          <Text
            style={{
              fontWeight: "600",
              color: c.foreground,
              fontSize: 13,
            }}
          >
            Record date (live)
          </Text>
          <Text style={{ fontSize: 11, color: c.mutedForeground }}>
            With consent — transcribe & analyze
          </Text>
        </Pressable>
      </View>
      <VoiceNoteFeedbackSheet
        visible={voiceNote}
        matchId={matchId}
        matchName={matchName}
        onClose={() => setVoiceNote(false)}
      />
      <InPersonRecordingSheet
        visible={inPerson}
        matchId={matchId}
        matchName={matchName}
        onClose={() => setInPerson(false)}
        onApplied={onApplied}
      />
    </>
  );
}

function TimelineCard({ events }: { events: MatchTimelineEvent[] }) {
  const c = useColors();
  const primaryEvents = events
    .filter((event) =>
      [
        "date_scheduled",
        "voice_debrief",
        "date_debrief",
        "in_person_recording",
        "manual_note",
        "screenshot_import",
        "chat_insight",
      ].includes(event.type),
    )
    .slice(0, 5);

  if (primaryEvents.length === 0) return null;

  return (
    <Card>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 4,
        }}
      >
        <SectionLabel>Timeline</SectionLabel>
        <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
          {events.length} saved
        </Text>
      </View>
      <View style={{ gap: 12 }}>
        {primaryEvents.map((event) => (
          <View key={event.id} style={{ flexDirection: "row", gap: 10 }}>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: timelineColor(event.type, c),
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name={timelineIcon(event.type)} size={14} color="#fff" />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <Text
                  style={{
                    flex: 1,
                    color: c.foreground,
                    fontWeight: "600",
                    fontSize: 13,
                  }}
                  numberOfLines={1}
                >
                  {event.title}
                </Text>
                <Text
                  style={{ color: c.mutedForeground, fontSize: 11 }}
                  numberOfLines={1}
                >
                  {formatTimeAgo(event.occurredAt)}
                </Text>
              </View>
              {event.summary && (
                <Text
                  style={{
                    color: c.mutedForeground,
                    fontSize: 12,
                    lineHeight: 17,
                  }}
                  numberOfLines={3}
                >
                  {event.summary}
                </Text>
              )}
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

function timelineIcon(
  type: MatchTimelineEvent["type"],
): keyof typeof Feather.glyphMap {
  if (type === "date_scheduled") return "calendar";
  if (type === "date_debrief") return "calendar";
  if (type === "in_person_recording") return "radio";
  if (type === "screenshot_import") return "image";
  if (type === "chat_insight") return "message-circle";
  if (type === "manual_note") return "edit-3";
  return "mic";
}

function timelineColor(
  type: MatchTimelineEvent["type"],
  c: ReturnType<typeof useColors>,
) {
  if (type === "date_scheduled") return c.primary;
  if (type === "date_debrief") return c.accentForeground;
  if (type === "in_person_recording") return c.foreground;
  if (type === "screenshot_import") return c.success;
  if (type === "chat_insight") return c.primary;
  if (type === "manual_note") return c.warning;
  return c.success;
}

function ChatLinkCard({
  matchId,
  matchName,
}: {
  matchId: number;
  matchName: string;
}) {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const openChat = async () => {
    setBusy(true);
    try {
      const created = await createChatConversation({
        title: `Chat about ${matchName}`,
        matchId,
      });
      qc.invalidateQueries({
        queryKey: getListChatConversationsQueryKey(),
      });
      router.push(`/chat/${created.id}`);
    } catch (e: any) {
      Alert.alert("Couldn't start chat", e?.message ?? "Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      onPress={openChat}
      disabled={busy}
      style={({ pressed }) => ({
        backgroundColor: c.accent,
        borderRadius: c.radius,
        padding: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: c.card,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather name="message-circle" size={18} color={c.accentForeground} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 14,
            fontWeight: "600",
            color: c.accentForeground,
          }}
        >
          Chat with HeyTelli about {matchName}
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: c.accentForeground,
            opacity: 0.7,
            marginTop: 2,
          }}
        >
          Talk through next moves, patterns, and what you want to say
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator color={c.accentForeground} />
      ) : (
        <Feather name="chevron-right" size={18} color={c.accentForeground} />
      )}
    </Pressable>
  );
}

function BetaFeedbackCard({
  matchId,
  surface,
  prompt,
}: {
  matchId: number;
  surface: string;
  prompt: string;
}) {
  const c = useColors();
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const typeForAnswer = (answer: string): FeedbackType => {
    if (answer === "Yes") return "Love this";
    if (answer === "Maybe") return "Confusing";
    return "Bug";
  };

  const send = async (answer: string) => {
    setBusy(true);
    try {
      await submitImprovementFeedback({
        type: typeForAnswer(answer),
        message: `${prompt}: ${answer}`,
        matchId,
        surface,
        technicalContextConsent: true,
        context: { prompt, answer },
      });
      setSent(answer);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
    } catch {
      Alert.alert("Couldn't save feedback", "Try again later.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card>
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name="message-square" size={15} color={c.primary} />
            <SectionLabel>Beta check</SectionLabel>
          </View>
          <Text
            style={{
              color: c.foreground,
              fontSize: 14,
              fontWeight: "600",
            }}
          >
            {prompt}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {["Yes", "Maybe", "No"].map((answer) => (
              <Button
                key={answer}
                label={sent === answer ? "Saved" : answer}
                onPress={() => send(answer)}
                disabled={busy || sent === answer}
                variant={answer === "Yes" ? "secondary" : "ghost"}
                small
                style={{ flex: 1 }}
              />
            ))}
          </View>
          <Button
            label="Tell us more"
            icon="message-circle"
            variant="ghost"
            small
            onPress={() => setFeedbackOpen(true)}
          />
        </View>
      </Card>
      <FeedbackSheet
        visible={feedbackOpen}
        surface={surface}
        matchId={matchId}
        onClose={() => setFeedbackOpen(false)}
      />
    </>
  );
}

function heroToneColors(
  tone: "success" | "warning" | "danger" | "muted" | "primary",
  c: ReturnType<typeof useColors>,
) {
  if (tone === "success") {
    return { bg: c.successBg, fg: c.success, border: c.success + "55" };
  }
  if (tone === "warning") {
    return { bg: c.warningBg, fg: c.warning, border: c.warning + "55" };
  }
  if (tone === "danger") {
    return {
      bg: c.destructive + "12",
      fg: c.destructive,
      border: c.destructive + "55",
    };
  }
  if (tone === "primary") {
    return { bg: c.infoBg, fg: c.info, border: c.info + "55" };
  }
  return { bg: c.muted, fg: c.mutedForeground, border: c.border };
}

function NextStepCard({ match }: { match: MatchDetail }) {
  const c = useColors();
  const model = getMatchDetailHeroModel(match);
  const tone = heroToneColors(model.tone, c);

  return (
    <Card style={{ borderColor: tone.fg + "55" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: tone.bg,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name="arrow-right-circle" size={20} color={tone.fg} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <SectionLabel>{model.eyebrow}</SectionLabel>
          <Text
            style={{
              color: c.foreground,
              fontSize: 18,
              fontWeight: "700",
            }}
          >
            {model.title}
          </Text>
        </View>
      </View>
      <Body muted style={{ marginTop: 10 }}>
        {model.body}
      </Body>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 6,
          marginTop: 12,
        }}
      >
        {model.chips.map((chip, index) => (
          <View
            key={`${chip}-${index}`}
            style={{
              backgroundColor: c.muted,
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}
          >
            <Text style={{ color: c.mutedForeground, fontSize: 11 }}>
              {chip}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function HeaderCard({
  match,
  localPhotoUri,
  setLocalMatchPhoto,
  removeLocalMatchPhoto,
  onChange,
}: {
  match: MatchDetail;
  localPhotoUri?: string | null;
  setLocalMatchPhoto: (
    matchId: number | string,
    sourceUri: string,
  ) => Promise<string>;
  removeLocalMatchPhoto: (matchId: number | string) => Promise<void>;
  onChange: () => void;
}) {
  const c = useColors();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(match.name);
  const [saving, setSaving] = useState(false);
  const [photoSaving, setPhotoSaving] = useState(false);
  const photo = localPhotoUri;

  const saveName = async () => {
    if (!name.trim() || name === match.name) {
      setEditingName(false);
      setName(match.name);
      return;
    }
    setSaving(true);
    try {
      await updateMatch(match.id, { name: name.trim() });
      onChange();
      setEditingName(false);
    } catch (e: any) {
      Alert.alert("Couldn't rename", e?.message ?? "Try again.");
    } finally {
      setSaving(false);
    }
  };

  const chooseLocalMatchPhoto = async () => {
    if (photoSaving) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Photos access needed",
        "Allow photo library access to add a private match photo.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled) return;

    const uri = result.assets[0]?.uri;
    if (!uri) return;

    setPhotoSaving(true);
    try {
      await setLocalMatchPhoto(match.id, uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
    } catch (e: any) {
      Alert.alert("Couldn't save photo", e?.message ?? "Try again.");
    } finally {
      setPhotoSaving(false);
    }
  };

  const clearMatchPhoto = async () => {
    if (photoSaving || !localPhotoUri) return;
    setPhotoSaving(true);
    try {
      await removeLocalMatchPhoto(match.id);
    } catch (e: any) {
      Alert.alert("Couldn't remove photo", e?.message ?? "Try again.");
    } finally {
      setPhotoSaving(false);
    }
  };

  return (
    <Card>
      <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
        {photo ? (
          <Image
            source={photo}
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: c.muted,
            }}
            contentFit="cover"
          />
        ) : (
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: c.muted,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="user" size={28} color={c.mutedForeground} />
          </View>
        )}
        <View style={{ flex: 1, gap: 4 }}>
          {editingName ? (
            <View
              style={{ flexDirection: "row", gap: 6, alignItems: "center" }}
            >
              <TextInput
                value={name}
                onChangeText={setName}
                autoFocus
                onSubmitEditing={saveName}
                style={{
                  flex: 1,
                  fontSize: 22,
                  fontWeight: "700",
                  color: c.foreground,
                  borderBottomWidth: 1,
                  borderBottomColor: c.border,
                  paddingVertical: 4,
                }}
              />
              <IconButton
                icon={saving ? "loader" : "check"}
                onPress={saveName}
                color={c.primary}
                hint="Save name"
              />
            </View>
          ) : (
            <Pressable
              onPress={() => setEditingName(true)}
              hitSlop={6}
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: "700",
                  color: c.foreground,
                  flex: 1,
                }}
                numberOfLines={1}
              >
                {match.name}
              </Text>
              <Feather name="edit-2" size={14} color={c.mutedForeground} />
            </Pressable>
          )}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <StatusPill status={match.status} small />
            {match.extractedProfile.job && (
              <Text
                style={{
                  fontSize: 12,
                  color: c.mutedForeground,
                  flex: 1,
                }}
                numberOfLines={1}
              >
                {match.extractedProfile.job}
                {match.extractedProfile.location
                  ? ` · ${match.extractedProfile.location}`
                  : ""}
              </Text>
            )}
          </View>
          <View style={{ gap: 8, marginTop: 6 }}>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  localPhotoUri ? "Replace match photo" : "Add match photo"
                }
                onPress={chooseLocalMatchPhoto}
                disabled={photoSaving}
                style={({ pressed }) => ({
                  minHeight: 34,
                  paddingHorizontal: 10,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: c.border,
                  backgroundColor: c.muted,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  opacity: pressed || photoSaving ? 0.65 : 1,
                })}
              >
                <Feather name="camera" size={13} color={c.foreground} />
                <Text
                  style={{
                    color: c.foreground,
                    fontSize: 12,
                    fontWeight: "700",
                  }}
                >
                  {localPhotoUri ? "Replace photo" : "Add photo"}
                </Text>
              </Pressable>
              {localPhotoUri && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove match photo"
                  onPress={clearMatchPhoto}
                  disabled={photoSaving}
                  style={({ pressed }) => ({
                    minHeight: 34,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: c.border,
                    backgroundColor: c.card,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    opacity: pressed || photoSaving ? 0.65 : 1,
                  })}
                >
                  <Feather name="x" size={13} color={c.mutedForeground} />
                  <Text
                    style={{
                      color: c.mutedForeground,
                      fontSize: 12,
                      fontWeight: "700",
                    }}
                  >
                    Remove
                  </Text>
                </Pressable>
              )}
            </View>
            <Text
              style={{
                color: c.mutedForeground,
                fontSize: 11,
                lineHeight: 15,
              }}
            >
              {localPhotoUri
                ? "Private match photo. Not sent to HeyTelli servers."
                : "Add a private match photo. It will not be sent to HeyTelli servers."}
            </Text>
          </View>
        </View>
      </View>
      <FreshnessChip match={match} />
      {match.vibeTags.length > 0 && (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 6,
            marginTop: 14,
          }}
        >
          {match.vibeTags.map((t) => (
            <VibeTag key={t} label={t} />
          ))}
        </View>
      )}
    </Card>
  );
}

function FreshnessChip({ match }: { match: MatchDetail }) {
  const c = useColors();
  if (match.screenshots.length === 0) return null;
  const f = match.analysisFreshness;
  const pending = match.pendingScreenshotCount + match.failedScreenshotCount;
  const isCurrent = f === "current";
  const tint = isCurrent ? c.success : c.warning;
  const bg = isCurrent ? c.successBg : c.warningBg;
  const icon = isCurrent ? "check-circle" : "refresh-cw";
  const label = isCurrent
    ? "Analysis up to date"
    : f === "never-analyzed"
      ? "Not analyzed yet"
      : `${pending} new screenshot${pending === 1 ? "" : "s"} to analyze`;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        alignSelf: "flex-start",
        backgroundColor: bg,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 999,
        marginTop: 10,
      }}
    >
      <Feather name={icon} size={11} color={tint} />
      <Text style={{ fontSize: 11, color: tint, fontWeight: "600" }}>
        {label}
      </Text>
    </View>
  );
}

function useScreenshotUpload({
  match,
  onChange,
}: {
  match: MatchDetail;
  onChange: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);

  const upload = async () => {
    if (uploading) return;

    const uris = await pickScreenshotUris();
    if (uris.length === 0) return;

    setUploading(true);
    setUploadCount(uris.length);
    try {
      const result = await attachScreenshotsToMatch(match.id, uris);
      if (result.savedCount > 0) {
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
      }
      onChange();
      if (result.failedCount > 0) {
        Alert.alert(
          result.savedCount > 0 ? "Some screenshots failed" : "Upload failed",
          result.savedCount > 0
            ? `${result.savedCount} screenshot${result.savedCount === 1 ? "" : "s"} saved. ${result.failedCount} did not upload.`
            : "No screenshots were added. Try again.",
        );
      }
    } catch (e: any) {
      onChange();
      Alert.alert(
        uris.length === 1 ? "Upload failed" : "Some screenshots failed",
        e?.message ?? "Try again.",
      );
    } finally {
      setUploading(false);
      setUploadCount(0);
    }
  };

  return { upload, uploading, uploadCount };
}

async function pickScreenshotUris(): Promise<string[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(
      "Photos access needed",
      "Allow photo library access to add screenshots.",
    );
    return [];
  }

  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.85,
    allowsMultipleSelection: true,
    selectionLimit: MAX_SHARED_SCREENSHOTS,
    orderedSelection: true,
  });
  if (res.canceled) return [];

  return res.assets
    .map((asset) => asset.uri)
    .filter((uri): uri is string => Boolean(uri))
    .slice(0, MAX_SHARED_SCREENSHOTS);
}

async function attachScreenshotsToMatch(matchId: number, uris: string[]) {
  let savedCount = 0;
  let failedCount = 0;

  for (const uri of uris) {
    try {
      const path = await uploadImage(uri);
      await addScreenshot(matchId, { objectPath: path });
      savedCount += 1;
    } catch {
      failedCount += 1;
    }
  }

  return { savedCount, failedCount };
}

function ScreenshotIntakeCard({
  match,
  onChange,
}: {
  match: MatchDetail;
  onChange: () => void;
}) {
  const c = useColors();
  const { upload, uploading, uploadCount } = useScreenshotUpload({
    match,
    onChange,
  });
  const pending = match.pendingScreenshotCount + match.failedScreenshotCount;
  const savedCount = match.screenshots.length;
  const status = uploading
    ? uploadCount === 1
      ? "Uploading screenshot..."
      : `Uploading ${uploadCount} screenshots...`
    : pending > 0
      ? `${pending} screenshot${pending === 1 ? "" : "s"} waiting`
      : savedCount > 0
        ? `${savedCount} saved`
        : "Start with the latest chat";

  return (
    <Pressable
      onPress={upload}
      disabled={uploading}
      accessibilityRole="button"
      accessibilityLabel={`Upload screenshots for ${match.name}`}
      style={({ pressed }) => ({
        backgroundColor: c.primary,
        borderRadius: c.radius,
        padding: 16,
        minHeight: 92,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        opacity: uploading ? 0.78 : pressed ? 0.86 : 1,
      })}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: "rgba(255,255,255,0.18)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather name="upload-cloud" size={23} color={c.primaryForeground} />
      </View>
      <View style={{ flex: 1, gap: 5, minWidth: 0 }}>
        <Text
          style={{
            fontSize: 17,
            fontWeight: "700",
            color: c.primaryForeground,
          }}
          numberOfLines={1}
        >
          Upload screenshots
        </Text>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "500",
            color: c.primaryForeground,
            opacity: 0.82,
          }}
          numberOfLines={1}
        >
          Select up to {MAX_SHARED_SCREENSHOTS} profile or chat shots
        </Text>
        <View
          style={{
            alignSelf: "flex-start",
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: "rgba(255,255,255,0.16)",
          }}
        >
          <Feather
            name={
              pending > 0 ? "refresh-cw" : savedCount > 0 ? "check" : "plus"
            }
            size={11}
            color={c.primaryForeground}
          />
          <Text
            style={{
              fontSize: 11,
              fontWeight: "600",
              color: c.primaryForeground,
            }}
            numberOfLines={1}
          >
            {status}
          </Text>
        </View>
      </View>
      {uploading ? (
        <ActivityIndicator color={c.primaryForeground} />
      ) : (
        <Feather name="chevron-right" size={20} color={c.primaryForeground} />
      )}
    </Pressable>
  );
}

function LatestReadCard({
  match,
  onChange,
}: {
  match: MatchDetail;
  onChange: () => void;
}) {
  const c = useColors();
  const [rescoring, setRescoring] = useState(false);
  const pending = match.pendingScreenshotCount + match.failedScreenshotCount;
  const hasRead = Boolean(match.lastRead?.body?.trim());
  const isCurrent = match.readFreshness === "current";
  const isStale = match.readFreshness === "stale" || pending > 0;
  const statusLabel = isCurrent
    ? "Up to date"
    : pending > 0
      ? `${pending} screenshot${pending === 1 ? "" : "s"} not analyzed`
      : hasRead
        ? "Needs reanalysis"
        : "No read yet";
  const statusColor = isCurrent ? c.success : c.warning;
  const statusBg = isCurrent ? c.successBg : c.warningBg;

  const doRescore = async () => {
    setRescoring(true);
    try {
      await rescoreMatch(match.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      onChange();
    } catch (e: any) {
      Alert.alert("Couldn't reanalyze", e?.message ?? "Try again.");
    } finally {
      setRescoring(false);
    }
  };

  return (
    <Card style={{ borderColor: isStale ? c.warning : c.border }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 10,
        }}
      >
        <SectionLabel>Latest read</SectionLabel>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: statusBg,
          }}
        >
          <Feather
            name={isCurrent ? "check-circle" : "refresh-cw"}
            size={11}
            color={statusColor}
          />
          <Text
            style={{
              fontSize: 11,
              color: statusColor,
              fontWeight: "600",
            }}
            numberOfLines={1}
          >
            {statusLabel}
          </Text>
        </View>
      </View>
      <Body muted={!hasRead} style={{ fontSize: 13, lineHeight: 19 }}>
        {hasRead
          ? match.lastRead!.body
          : "Upload screenshots, then reanalyze to generate the first read."}
      </Body>
      {!isCurrent && (
        <Button
          label={hasRead ? "Reanalyze screenshots" : "Analyze screenshots"}
          icon="refresh-cw"
          onPress={doRescore}
          loading={rescoring}
          variant="secondary"
          style={{ marginTop: 12 }}
        />
      )}
    </Card>
  );
}

function PickerRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const c = useColors();
  return (
    <View
      style={{
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 10,
        paddingHorizontal: 12,
        backgroundColor: c.background,
      }}
    >
      <Text
        style={{
          color: c.foreground,
          fontSize: 14,
          fontWeight: "500",
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

function PickerTriggerRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => ({
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 10,
        paddingHorizontal: 12,
        backgroundColor: c.background,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <Text
        style={{
          color: c.foreground,
          fontSize: 14,
          fontWeight: "500",
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text
          style={{
            color: c.mutedForeground,
            fontSize: 14,
            fontWeight: "500",
          }}
        >
          {value}
        </Text>
        <Feather name="chevron-right" size={16} color={c.mutedForeground} />
      </View>
    </Pressable>
  );
}

function ScheduleDateCard({
  match,
  onChange,
}: {
  match: MatchDetail;
  onChange: () => void;
}) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const initialDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(19, 0, 0, 0);
    return date;
  }, []);
  const [selectedAt, setSelectedAt] = useState(initialDate);
  const [androidPickerMode, setAndroidPickerMode] = useState<
    "date" | "time" | null
  >(null);
  const [where, setWhere] = useState("");
  const [outfit, setOutfit] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const parsed = selectedAt;
    if (Number.isNaN(parsed.getTime())) {
      Alert.alert("When?", "Pick the date and time for this date.");
      return;
    }
    if (parsed.getTime() <= Date.now()) {
      Alert.alert(
        "Pick a future time",
        "Date prep works best when the next date is still ahead.",
      );
      return;
    }
    setSaving(true);
    try {
      const location = where.trim() || null;
      await updateMatch(match.id, {
        nextDateAt: parsed.toISOString(),
        nextDateLocation: location,
        nextDateOutfit: outfit.trim() || null,
        dateSafetyPlan: null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );

      // Schedule local reminder for date day (9am local)
      scheduleDateDayReminder(match.id, match.name, parsed, location).catch(
        () => {},
      );

      // Offer calendar add
      Alert.alert(
        "Add to calendar?",
        `Create a calendar event for your date with ${match.name}?`,
        [
          { text: "Not now", style: "cancel" },
          {
            text: "Add",
            onPress: () => {
              addDateToCalendar(match.name, parsed, location).then((id) => {
                if (!id) {
                  Alert.alert(
                    "Couldn't add",
                    "Calendar permission denied or unavailable.",
                  );
                }
              });
            },
          },
        ],
      );

      onChange();
      setOpen(false);
      setWhere("");
      setOutfit("");
    } catch (e: any) {
      Alert.alert("Couldn't schedule", e?.message ?? "Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <SectionLabel>Next date</SectionLabel>
      {!open ? (
        <Button
          label="Schedule a date"
          icon="calendar"
          onPress={() => setOpen(true)}
          variant="secondary"
        />
      ) : (
        <View style={{ gap: 10 }}>
          {Platform.OS === "ios" ? (
            <>
              <PickerRow label="Date">
                <DateTimePicker
                  value={selectedAt}
                  mode="date"
                  display="compact"
                  minimumDate={new Date()}
                  onChange={(_, date) => {
                    if (!date) return;
                    setSelectedAt((current) => {
                      const next = new Date(current);
                      next.setFullYear(
                        date.getFullYear(),
                        date.getMonth(),
                        date.getDate(),
                      );
                      return next;
                    });
                  }}
                />
              </PickerRow>
              <PickerRow label="Time">
                <DateTimePicker
                  value={selectedAt}
                  mode="time"
                  display="compact"
                  minuteInterval={15}
                  onChange={(_, date) => {
                    if (!date) return;
                    setSelectedAt((current) => {
                      const next = new Date(current);
                      next.setHours(date.getHours(), date.getMinutes(), 0, 0);
                      return next;
                    });
                  }}
                />
              </PickerRow>
            </>
          ) : (
            <>
              <PickerTriggerRow
                label="Date"
                value={selectedAt.toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
                onPress={() => setAndroidPickerMode("date")}
              />
              <PickerTriggerRow
                label="Time"
                value={selectedAt.toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                })}
                onPress={() => setAndroidPickerMode("time")}
              />
              {androidPickerMode && (
                <DateTimePicker
                  value={selectedAt}
                  mode={androidPickerMode}
                  display="default"
                  minimumDate={
                    androidPickerMode === "date" ? new Date() : undefined
                  }
                  minuteInterval={15}
                  onChange={(_, date) => {
                    setAndroidPickerMode(null);
                    if (!date) return;
                    setSelectedAt((current) => {
                      const next = new Date(current);
                      if (androidPickerMode === "date") {
                        next.setFullYear(
                          date.getFullYear(),
                          date.getMonth(),
                          date.getDate(),
                        );
                      } else {
                        next.setHours(date.getHours(), date.getMinutes(), 0, 0);
                      }
                      return next;
                    });
                  }}
                />
              )}
            </>
          )}
          <Body muted style={{ fontSize: 12 }}>
            {formatDateTime(selectedAt.toISOString())}
          </Body>
          <Input
            placeholder="Where (optional)"
            value={where}
            onChangeText={setWhere}
          />
          <Input
            placeholder="Outfit note (optional)"
            value={outfit}
            onChangeText={setOutfit}
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              label="Cancel"
              onPress={() => setOpen(false)}
              variant="ghost"
              style={{ flex: 1 }}
            />
            <Button
              label="Save"
              onPress={save}
              loading={saving}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      )}
    </Card>
  );
}

function withTimeOnDate(dateValue: string | null, timeValue: Date): Date {
  const base = dateValue ? new Date(dateValue) : new Date();
  if (Number.isNaN(base.getTime())) return timeValue;
  const next = new Date(base);
  next.setHours(timeValue.getHours(), timeValue.getMinutes(), 0, 0);
  if (next.getTime() <= base.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function defaultPlanTime(
  match: MatchDetail,
  field: "checkInAt" | "expectedEndAt",
  fallbackValue?: string | null,
): Date {
  const existing = match.dateSafetyPlan?.[field];
  if (existing) {
    const date = new Date(existing);
    if (!Number.isNaN(date.getTime())) return date;
  }
  if (fallbackValue) {
    const fallback = new Date(fallbackValue);
    if (!Number.isNaN(fallback.getTime())) return fallback;
  }
  const start = match.nextDateAt ? new Date(match.nextDateAt) : new Date();
  if (Number.isNaN(start.getTime())) return new Date();
  const next = new Date(start);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + (field === "checkInAt" ? 1 : 3));
  return next;
}

function initialSafeDateChecklist(
  match: MatchDetail,
  defaultPlan?: DateSafetyPlan,
): SafeDateChecklist {
  const source =
    match.dateSafetyPlan?.safeDateChecklist ?? defaultPlan?.safeDateChecklist;
  return {
    publicPlace: source?.publicPlace ?? false,
    ownTransport: source?.ownTransport ?? false,
    circleHasPlan: source?.circleHasPlan ?? false,
    profileReviewed: source?.profileReviewed ?? false,
    noPrivateLocationPressure: source?.noPrivateLocationPressure ?? false,
    noMoneyOrPhotoPressure: source?.noMoneyOrPhotoPressure ?? false,
  };
}

const COVER_MODE_OPTIONS: Array<{
  id: CoverModeTheme;
  label: string;
  detail: string;
  icon: keyof typeof Feather.glyphMap;
}> = [
  {
    id: "clock",
    label: "Clock screen",
    detail: "A dim, harmless time view for this date.",
    icon: "clock",
  },
  {
    id: "notes",
    label: "Notes",
    detail: "Looks like a quiet note page.",
    icon: "file-text",
  },
  {
    id: "breathing",
    label: "Breathing",
    detail: "Looks like a simple focus timer.",
    icon: "circle",
  },
];

function isDateModeActive(status: DateModeStatus | null | undefined): boolean {
  return (
    status === "on_date" ||
    status === "check_in_due" ||
    status === "safe" ||
    status === "needs_exit" ||
    status === "missed_check_in"
  );
}

function dateModeStatusForCircle(
  status: CircleCheckStatus,
): DateModeStatus | null {
  if (status === "safe") return "safe";
  if (status === "needs_help") return "needs_exit";
  if (status === "completed") return "home_safe";
  return null;
}

function DateModeCoverScreen({
  match,
  busyAction,
  onCoverAction,
  onOpenPlan,
}: {
  match: MatchDetail;
  busyAction: CoverQuickActionId | null;
  onCoverAction: (action: CoverQuickActionId) => void;
  onOpenPlan: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(() => new Date());
  const [coverActionsVisible, setCoverActionsVisible] = useState(false);
  const theme = match.dateSafetyPlan?.coverModeTheme ?? "clock";

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const revealCoverActions = () => {
    setCoverActionsVisible(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };
  const actions = coverActionsVisible ? (
    <CoverQuickActions
      theme={theme}
      busyAction={busyAction}
      onAction={onCoverAction}
      onDismiss={() => setCoverActionsVisible(false)}
      onOpenPlan={onOpenPlan}
    />
  ) : null;

  const time = now.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const date = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  if (theme === "notes") {
    return (
      <View
        style={{
          flex: 1,
          paddingTop: insets.top + 28,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 22,
          backgroundColor: "#fbfaf6",
          gap: 24,
        }}
      >
        <Stack.Screen options={{ headerShown: false }} />
        <Pressable onLongPress={revealCoverActions} delayLongPress={550}>
          <Text
            style={{
              color: "#1f2933",
              fontSize: 34,
              fontWeight: "700",
            }}
          >
            Notes
          </Text>
        </Pressable>
        <View style={{ gap: 18, marginTop: 20 }}>
          {[0, 1, 2, 3, 4].map((line) => (
            <View
              key={line}
              style={{
                height: 1,
                backgroundColor: "#d8d2c4",
                opacity: line === 4 ? 0.45 : 1,
              }}
            />
          ))}
        </View>
        <View style={{ marginTop: "auto", width: "100%" }}>{actions}</View>
      </View>
    );
  }

  if (theme === "breathing") {
    return (
      <View
        style={{
          flex: 1,
          paddingTop: insets.top + 30,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 22,
          backgroundColor: "#101820",
          alignItems: "center",
          justifyContent: "center",
          gap: 22,
        }}
      >
        <Stack.Screen options={{ headerShown: false }} />
        <Pressable
          onLongPress={revealCoverActions}
          delayLongPress={550}
          style={{
            width: 180,
            height: 180,
            borderRadius: 90,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.34)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: "#f7fafc",
              fontSize: 24,
              fontWeight: "700",
            }}
          >
            Breathe
          </Text>
        </Pressable>
        {actions}
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        paddingTop: insets.top + 34,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 22,
        backgroundColor: "#050608",
        alignItems: "center",
      }}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <Pressable
        onLongPress={revealCoverActions}
        delayLongPress={550}
        style={{
          marginTop: 72,
          alignItems: "center",
          gap: 8,
          width: "100%",
        }}
      >
        <Text
          style={{
            color: "#f7fafc",
            fontSize: 72,
            fontWeight: "700",
            fontVariant: ["tabular-nums"],
          }}
        >
          {time}
        </Text>
        <Text
          style={{
            color: "rgba(255,255,255,0.74)",
            fontSize: 18,
            fontWeight: "500",
          }}
        >
          {date}
        </Text>
      </Pressable>
      <View style={{ marginTop: "auto", width: "100%" }}>
        {actions ?? (
          <View
            style={{
              alignSelf: "center",
              width: 76,
              height: 5,
              borderRadius: 99,
              backgroundColor: "rgba(255,255,255,0.32)",
            }}
          />
        )}
      </View>
    </View>
  );
}

function CoverQuickActions({
  theme,
  busyAction,
  onAction,
  onDismiss,
  onOpenPlan,
}: {
  theme: CoverModeTheme;
  busyAction: CoverQuickActionId | null;
  onAction: (action: CoverQuickActionId) => void;
  onDismiss: () => void;
  onOpenPlan: () => void;
}) {
  const light = theme === "notes";
  const foreground = light ? "#1f2933" : "#f7fafc";
  const muted = light ? "#667085" : "rgba(255,255,255,0.66)";
  const panelBackground = light ? "#fffdf8" : "rgba(255,255,255,0.11)";
  const actionBackground = light ? "#f5f0e6" : "rgba(255,255,255,0.14)";
  const borderColor = light ? "#e4dbc9" : "rgba(255,255,255,0.18)";
  const disabled = busyAction !== null;

  return (
    <View
      style={{
        width: "100%",
        borderRadius: 24,
        borderWidth: 1,
        borderColor,
        backgroundColor: panelBackground,
        padding: 14,
        gap: 12,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Text
          style={{
            color: foreground,
            fontSize: 16,
            fontWeight: "700",
          }}
        >
          Timer controls
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Pressable
            onPress={onOpenPlan}
            style={({ pressed }) => ({
              borderWidth: 1,
              borderColor,
              borderRadius: 99,
              paddingHorizontal: 14,
              paddingVertical: 8,
              opacity: pressed ? 0.72 : 1,
            })}
          >
            <Text
              style={{
                color: foreground,
                fontSize: 12,
                fontWeight: "700",
              }}
            >
              Edit
            </Text>
          </Pressable>
          <Pressable
            onPress={onDismiss}
            hitSlop={8}
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: 18,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.72 : 1,
            })}
          >
            <Feather name="x" size={18} color={muted} />
          </Pressable>
        </View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {COVER_QUICK_ACTIONS.map((action) => {
          const busy = busyAction === action.id;
          return (
            <Pressable
              key={action.id}
              disabled={disabled}
              onPress={() => onAction(action.id)}
              style={({ pressed }) => ({
                flexGrow: 1,
                flexBasis: action.id === "home" ? "100%" : "47%",
                minHeight: 78,
                borderRadius: 18,
                borderWidth: 1,
                borderColor,
                backgroundColor: actionBackground,
                padding: 13,
                gap: 7,
                opacity: disabled ? (busy ? 1 : 0.42) : pressed ? 0.72 : 1,
              })}
            >
              {busy ? (
                <ActivityIndicator color={foreground} />
              ) : (
                <Feather
                  name={action.icon as keyof typeof Feather.glyphMap}
                  size={22}
                  color={foreground}
                />
              )}
              <Text
                style={{
                  color: foreground,
                  fontSize: 18,
                  fontWeight: "700",
                }}
              >
                {action.label}
              </Text>
              <Text
                style={{
                  color: muted,
                  fontSize: 12,
                  fontWeight: "500",
                }}
              >
                {action.detail}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function DateSafetyPlanCard({
  match,
  onChange,
  onHideCover,
}: {
  match: MatchDetail;
  onChange: () => void;
  onHideCover: () => void;
}) {
  const c = useColors();
  const { settings } = useUserSettings();
  const plan = match.dateSafetyPlan;
  const defaultPlan = useMemo(
    () => buildDateSafetyPlanFromSettings(settings, match),
    [match.nextDateAt, settings],
  );
  const status = getDateSafetyPlanStatus(match);
  const [open, setOpen] = useState(status.state !== "ready");
  const [trustedCircleName, setTrustedCircleName] = useState(
    plan?.trustedCircleName ?? defaultPlan.trustedCircleName ?? "",
  );
  const [transportPlan, setTransportPlan] = useState(
    plan?.transportPlan ?? defaultPlan.transportPlan ?? "",
  );
  const [checkInAt, setCheckInAt] = useState(() =>
    defaultPlanTime(match, "checkInAt", defaultPlan.checkInAt),
  );
  const [expectedEndAt, setExpectedEndAt] = useState(() =>
    defaultPlanTime(match, "expectedEndAt", defaultPlan.expectedEndAt),
  );
  const [codeWord, setCodeWord] = useState(
    plan?.codeWord ?? defaultPlan.codeWord ?? "",
  );
  const [circleNote, setCircleNote] = useState(
    plan?.circleNote ?? defaultPlan.circleNote ?? "",
  );
  const [shareLiveLocation, setShareLiveLocation] = useState(
    plan?.shareLiveLocation ?? defaultPlan.shareLiveLocation ?? false,
  );
  const [coverModeEnabled, setCoverModeEnabled] = useState(
    plan?.coverModeEnabled ?? false,
  );
  const [coverModeTheme, setCoverModeTheme] = useState<CoverModeTheme>(
    plan?.coverModeTheme ?? "clock",
  );
  const [dateModeStatus, setDateModeStatus] = useState<DateModeStatus>(
    plan?.dateModeStatus ?? "planning",
  );
  const [dateModeStartedAt, setDateModeStartedAt] = useState<string | null>(
    plan?.dateModeStartedAt ?? null,
  );
  const [dateModeClosedAt, setDateModeClosedAt] = useState<string | null>(
    plan?.dateModeClosedAt ?? null,
  );
  const [safeDateChecklist, setSafeDateChecklist] = useState<SafeDateChecklist>(
    () => initialSafeDateChecklist(match, defaultPlan),
  );
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [circleChecking, setCircleChecking] = useState(false);
  const [planDirty, setPlanDirty] = useState(false);
  const [defaultPlanAppliedKey, setDefaultPlanAppliedKey] = useState<
    string | null
  >(null);
  const [androidPickerMode, setAndroidPickerMode] = useState<
    "check-in" | "end" | null
  >(null);
  const defaultPlanKey = JSON.stringify(defaultPlan);

  useEffect(() => {
    if (plan) return;
    if (planDirty) return;
    if (defaultPlanAppliedKey === defaultPlanKey) return;
    setTrustedCircleName(defaultPlan.trustedCircleName ?? "");
    setTransportPlan(defaultPlan.transportPlan ?? "");
    setCheckInAt(defaultPlanTime(match, "checkInAt", defaultPlan.checkInAt));
    setExpectedEndAt(
      defaultPlanTime(match, "expectedEndAt", defaultPlan.expectedEndAt),
    );
    setCodeWord(defaultPlan.codeWord ?? "");
    setCircleNote(defaultPlan.circleNote ?? "");
    setShareLiveLocation(defaultPlan.shareLiveLocation ?? false);
    setCoverModeEnabled(false);
    setCoverModeTheme("clock");
    setDateModeStatus("planning");
    setDateModeStartedAt(null);
    setDateModeClosedAt(null);
    setSafeDateChecklist(initialSafeDateChecklist(match, defaultPlan));
    setDefaultPlanAppliedKey(defaultPlanKey);
  }, [
    defaultPlanAppliedKey,
    defaultPlanKey,
    match.id,
    match.nextDateAt,
    plan,
    planDirty,
  ]);

  const previewMatch = {
    ...match,
    dateSafetyPlan: {
      trustedCircleName: trustedCircleName.trim() || null,
      transportPlan: transportPlan.trim() || null,
      checkInAt: checkInAt.toISOString(),
      expectedEndAt: expectedEndAt.toISOString(),
      codeWord: codeWord.trim() || null,
      circleNote: circleNote.trim() || null,
      shareLiveLocation,
      safeDateChecklist,
      circleCheckStatus: plan?.circleCheckStatus ?? "planned",
      lastCircleCheckAt: plan?.lastCircleCheckAt ?? null,
      coverModeEnabled,
      coverModeTheme,
      dateModeStatus,
      dateModeStartedAt,
      dateModeClosedAt,
    },
  };
  const previewStatus = getDateSafetyPlanStatus(previewMatch);
  const checklistProgress = getDateSafetyChecklistProgress(safeDateChecklist);
  const displayStatus = open ? previewStatus : status;
  const shareTarget = previewMatch;
  const shareStatus = getDateSafetyPlanStatus(shareTarget);

  const shareMessage = async (message: string): Promise<boolean> => {
    try {
      const result = await Share.share({ message });
      return result.action === Share.sharedAction;
    } catch (e: any) {
      Alert.alert("Couldn't share", e?.message ?? "Try again.");
      return false;
    }
  };

  const currentPlanInput = (
    nextChecklist = safeDateChecklist,
    overrides: Partial<DateSafetyPlanInput> = {},
  ): DateSafetyPlanInput => ({
    trustedCircleName: trustedCircleName.trim() || null,
    transportPlan: transportPlan.trim() || null,
    checkInAt: checkInAt.toISOString(),
    expectedEndAt: expectedEndAt.toISOString(),
    codeWord: codeWord.trim() || null,
    circleNote: circleNote.trim() || null,
    shareLiveLocation,
    safeDateChecklist: nextChecklist,
    circleCheckStatus: plan?.circleCheckStatus ?? "planned",
    lastCircleCheckAt: plan?.lastCircleCheckAt ?? null,
    coverModeEnabled,
    coverModeTheme,
    dateModeStatus,
    dateModeStartedAt,
    dateModeClosedAt,
    ...overrides,
  });

  const handleShareDateCard = async () => {
    if (shareStatus.state !== "ready") {
      Alert.alert(
        "Finish the Date Card",
        `Add ${shareStatus.missing.join(", ")} before sharing.`,
      );
      return;
    }
    const shared = await shareMessage(buildDateCardMessage(shareTarget));
    if (!shared) return;
    const sharedChecklist = { ...safeDateChecklist, circleHasPlan: true };
    const nextDateModeStatus: DateModeStatus = "date_card_sent";
    setSafeDateChecklist(sharedChecklist);
    setDateModeStatus(nextDateModeStatus);
    try {
      await updateMatch(match.id, {
        dateSafetyPlan: currentPlanInput(sharedChecklist, {
          dateModeStatus: nextDateModeStatus,
        }),
      });
      setPlanDirty(false);
      setOpen(false);
      onChange();
    } catch (e: any) {
      Alert.alert("Shared, but not saved", e?.message ?? "Try saving again.");
    }
  };

  const applyDatePlanTemplate = (template: DatePlanTemplate) => {
    const next = buildDatePlanFromTemplate(template, match.nextDateAt);
    setPlanDirty(true);
    setTransportPlan(next.transportPlan ?? "");
    setCircleNote(next.circleNote ?? "");
    setSafeDateChecklist(next.safeDateChecklist);
    if (next.checkInAt) setCheckInAt(new Date(next.checkInAt));
    if (next.expectedEndAt) setExpectedEndAt(new Date(next.expectedEndAt));
  };

  const save = async () => {
    if (!match.nextDateAt) {
      Alert.alert("Schedule the date first", "Add a date and time first.");
      return;
    }
    if (expectedEndAt.getTime() <= new Date(match.nextDateAt).getTime()) {
      Alert.alert(
        "Expected end?",
        "Pick an expected end time after the date starts.",
      );
      return;
    }
    if (previewStatus.state !== "ready") {
      Alert.alert(
        "Finish the Date Card",
        `Add ${previewStatus.missing.join(", ")} before saving or sharing.`,
      );
      return;
    }
    setSaving(true);
    try {
      await updateMatch(match.id, {
        dateSafetyPlan: currentPlanInput(),
      });
      scheduleDateSafetyReminders({
        matchId: match.id,
        name: match.name,
        checkInAt,
        expectedEndAt,
      }).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      setPlanDirty(false);
      setOpen(false);
      onChange();
    } catch (e: any) {
      Alert.alert("Couldn't save safety plan", e?.message ?? "Try again.");
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setClearing(true);
    try {
      await updateMatch(match.id, { dateSafetyPlan: null });
      setTrustedCircleName(defaultPlan.trustedCircleName ?? "");
      setTransportPlan(defaultPlan.transportPlan ?? "");
      setCheckInAt(
        defaultPlanTime(
          { ...match, dateSafetyPlan: null },
          "checkInAt",
          defaultPlan.checkInAt,
        ),
      );
      setExpectedEndAt(
        defaultPlanTime(
          { ...match, dateSafetyPlan: null },
          "expectedEndAt",
          defaultPlan.expectedEndAt,
        ),
      );
      setCodeWord(defaultPlan.codeWord ?? "");
      setCircleNote(defaultPlan.circleNote ?? "");
      setShareLiveLocation(defaultPlan.shareLiveLocation ?? false);
      setCoverModeEnabled(false);
      setCoverModeTheme("clock");
      setDateModeStatus("planning");
      setDateModeStartedAt(null);
      setDateModeClosedAt(null);
      setSafeDateChecklist(
        initialSafeDateChecklist(
          { ...match, dateSafetyPlan: null },
          defaultPlan,
        ),
      );
      setPlanDirty(false);
      setOpen(true);
      cancelDateSafetyReminders(match.id).catch(() => {});
      onChange();
    } catch (e: any) {
      Alert.alert("Couldn't clear safety plan", e?.message ?? "Try again.");
    } finally {
      setClearing(false);
    }
  };

  const pickTime = (kind: "check-in" | "end", date: Date | undefined) => {
    setAndroidPickerMode(null);
    if (!date) return;
    setPlanDirty(true);
    const next = withTimeOnDate(match.nextDateAt, date);
    if (kind === "check-in") setCheckInAt(next);
    else setExpectedEndAt(next);
  };

  const toggleChecklist = (key: keyof SafeDateChecklist) => {
    setPlanDirty(true);
    setSafeDateChecklist((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const startDateMode = async () => {
    if (shareStatus.state !== "ready") {
      Alert.alert(
        "Finish the Date Card",
        `Add ${shareStatus.missing.join(", ")} before starting Date Mode.`,
      );
      return;
    }
    const startedAt = new Date().toISOString();
    setCircleChecking(true);
    try {
      await updateMatch(match.id, {
        dateSafetyPlan: currentPlanInput(safeDateChecklist, {
          dateModeStatus: "on_date",
          dateModeStartedAt: startedAt,
          dateModeClosedAt: null,
          coverModeEnabled,
          coverModeTheme,
        }),
      });
      setDateModeStatus("on_date");
      setDateModeStartedAt(startedAt);
      setDateModeClosedAt(null);
      setPlanDirty(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      onChange();
      if (coverModeEnabled) onHideCover();
    } catch (e: any) {
      Alert.alert("Couldn't start Date Mode", e?.message ?? "Try again.");
    } finally {
      setCircleChecking(false);
    }
  };

  const updateCircleStatus = async (
    status: CircleCheckStatus,
    message: string,
  ) => {
    setCircleChecking(true);
    try {
      const shared = await shareMessage(message);
      if (!shared) return;
      const checkedAt = new Date().toISOString();
      const nextDateModeStatus =
        dateModeStatusForCircle(status) ?? dateModeStatus;
      const nextDateModeClosedAt =
        status === "completed" ? checkedAt : dateModeClosedAt;
      await updateMatch(match.id, {
        dateSafetyPlan: currentPlanInput(safeDateChecklist, {
          circleCheckStatus: status,
          lastCircleCheckAt: checkedAt,
          dateModeStatus: nextDateModeStatus,
          dateModeClosedAt: nextDateModeClosedAt,
        }),
      });
      setDateModeStatus(nextDateModeStatus);
      setDateModeClosedAt(nextDateModeClosedAt);
      setPlanDirty(false);
      onChange();
    } catch (e: any) {
      Alert.alert("Couldn't update circle", e?.message ?? "Try again.");
    } finally {
      setCircleChecking(false);
    }
  };

  const statusTone =
    displayStatus.state === "ready"
      ? { bg: c.successBg, fg: c.success, icon: "check" as const }
      : { bg: c.warningBg, fg: c.warning, icon: "shield" as const };
  const circleStatusLabel =
    plan?.circleCheckStatus === "safe"
      ? "Checked in safe"
      : plan?.circleCheckStatus === "needs_help"
        ? "Exit support requested"
        : plan?.circleCheckStatus === "completed"
          ? "Date closed"
          : "Not shared yet";
  const dateModeLabel = getDateModeStatusLabel(dateModeStatus);
  const coverModeLabel = coverModeEnabled
    ? getCoverModeLabel(coverModeTheme)
    : "Off";
  const dateModeActive = isDateModeActive(dateModeStatus);
  const circleActionDisabled = shareStatus.state !== "ready" || circleChecking;
  const summaryItems = [
    {
      label: "Circle",
      value: trustedCircleName.trim() || plan?.trustedCircleName || "Add name",
    },
    {
      label: "Check-in",
      value: formatDateTime(checkInAt.toISOString()),
    },
    {
      label: "Expected end",
      value: formatDateTime(expectedEndAt.toISOString()),
    },
    {
      label: "Status",
      value: circleStatusLabel,
    },
    {
      label: "Date Mode",
      value: dateModeLabel,
    },
    {
      label: "Cover",
      value: coverModeLabel,
    },
  ];

  return (
    <Card
      style={{
        borderColor: displayStatus.state === "ready" ? c.success : c.warning,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Feather name="users" size={16} color={c.primary} />
          <SectionLabel>Date card</SectionLabel>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            paddingHorizontal: 9,
            paddingVertical: 5,
            borderRadius: 999,
            backgroundColor: statusTone.bg,
          }}
        >
          <Feather name={statusTone.icon} size={12} color={statusTone.fg} />
          <Text
            style={{
              color: statusTone.fg,
              fontSize: 11,
              fontWeight: "600",
            }}
          >
            {displayStatus.label}
          </Text>
        </View>
      </View>
      <View
        style={{
          marginTop: 12,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.background,
          padding: 12,
          gap: 10,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <Text
            style={{
              color: c.foreground,
              fontSize: 15,
              fontWeight: "700",
            }}
          >
            Date Card readiness
          </Text>
          <Text
            style={{
              color: checklistProgress.ready ? c.success : c.warning,
              fontSize: 12,
              fontWeight: "700",
              fontVariant: ["tabular-nums"],
            }}
          >
            {checklistProgress.completed}/{checklistProgress.total}
          </Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {summaryItems.map((item) => (
            <View
              key={item.label}
              style={{
                flexGrow: 1,
                flexBasis: "46%",
                borderRadius: 10,
                backgroundColor: c.card,
                borderWidth: 1,
                borderColor: c.border,
                padding: 9,
                gap: 3,
              }}
            >
              <Text
                style={{
                  color: c.mutedForeground,
                  fontSize: 10,
                  fontWeight: "600",
                  textTransform: "uppercase",
                }}
              >
                {item.label}
              </Text>
              <Text
                style={{
                  color: c.foreground,
                  fontSize: 12,
                  fontWeight: "600",
                }}
                numberOfLines={1}
              >
                {item.value}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <Body muted style={{ fontSize: 12, marginTop: 2 }}>
        Share the plan with your circle. It can include first name, date time,
        location, transport, check-in, expected end, code word, and your note.
        No photos or screenshots are included.
      </Body>
      {displayStatus.missing.length > 0 && !open && (
        <Body muted style={{ fontSize: 12, marginTop: 8 }}>
          Missing: {displayStatus.missing.join(", ")}
        </Body>
      )}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        <Button
          label={open ? "Hide editor" : plan ? "Edit plan" : "Make plan"}
          icon={open ? "chevron-up" : "shield"}
          onPress={() => setOpen((v) => !v)}
          variant="secondary"
          style={{ flex: 1 }}
        />
        <Button
          label="Share Date Card"
          icon="share"
          onPress={handleShareDateCard}
          disabled={shareStatus.state !== "ready"}
          variant="ghost"
          style={{ flex: 1 }}
        />
      </View>
      <View
        style={{
          marginTop: 12,
          borderWidth: 1,
          borderColor: dateModeActive ? c.primary : c.border,
          borderRadius: 12,
          backgroundColor: dateModeActive ? c.secondary : c.background,
          padding: 12,
          gap: 10,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name="shield" size={15} color={c.primary} />
            <Text
              style={{
                color: c.foreground,
                fontSize: 14,
                fontWeight: "700",
              }}
            >
              Date Mode
            </Text>
          </View>
          <Text
            style={{
              color: dateModeActive ? c.primary : c.mutedForeground,
              fontSize: 12,
              fontWeight: "700",
            }}
          >
            {dateModeLabel}
          </Text>
        </View>
        <Body muted style={{ fontSize: 12, lineHeight: 17 }}>
          Start this when you are actually on the date. It keeps the safety
          actions close and can hide the app behind a harmless cover for this
          date only.
        </Body>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button
            label={dateModeActive ? "Hide as clock" : "Start Date Mode"}
            icon={dateModeActive ? "clock" : "play-circle"}
            onPress={dateModeActive ? onHideCover : startDateMode}
            loading={!dateModeActive && circleChecking}
            disabled={
              circleActionDisabled || (dateModeActive && !coverModeEnabled)
            }
            variant={dateModeActive ? "secondary" : "primary"}
            style={{ flex: 1 }}
            small
          />
          <Button
            label="Home safe"
            icon="home"
            onPress={() =>
              updateCircleStatus(
                "completed",
                buildCircleCheckMessage(shareTarget, "completed"),
              )
            }
            disabled={circleActionDisabled || !dateModeActive}
            variant="ghost"
            style={{ flex: 1 }}
            small
          />
        </View>
        <Text
          style={{
            color: c.mutedForeground,
            fontSize: 11,
            lineHeight: 15,
          }}
        >
          Cover Mode: {coverModeLabel}
          {coverModeEnabled
            ? ". Long-press the cover to get back to HeyTelli."
            : ". Turn it on in the plan editor."}
        </Text>
      </View>
      {open && (
        <View style={{ gap: 10, marginTop: 12 }}>
          <View style={{ gap: 8 }}>
            <Text
              style={{
                color: c.foreground,
                fontSize: 13,
                fontWeight: "700",
              }}
            >
              Plan template
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {DATE_PLAN_TEMPLATES.map((template) => (
                <Button
                  key={template.id}
                  label={template.label}
                  icon="calendar"
                  onPress={() => applyDatePlanTemplate(template)}
                  variant="ghost"
                  small
                />
              ))}
              <Button
                label="Custom plan"
                icon="edit-3"
                onPress={() => setPlanDirty(true)}
                variant="secondary"
                small
              />
            </View>
          </View>
          <Input
            placeholder="Circle first names, up to 3 (not phone numbers)"
            value={trustedCircleName}
            onChangeText={(value) => {
              setPlanDirty(true);
              setTrustedCircleName(value);
            }}
          />
          <Input
            placeholder="Transport / exit plan"
            value={transportPlan}
            onChangeText={(value) => {
              setPlanDirty(true);
              setTransportPlan(value);
            }}
          />
          {Platform.OS === "ios" ? (
            <>
              <PickerRow label="Check-in">
                <DateTimePicker
                  value={checkInAt}
                  mode="time"
                  display="compact"
                  minuteInterval={15}
                  onChange={(_, date) => pickTime("check-in", date)}
                />
              </PickerRow>
              <PickerRow label="Expected end">
                <DateTimePicker
                  value={expectedEndAt}
                  mode="time"
                  display="compact"
                  minuteInterval={15}
                  onChange={(_, date) => pickTime("end", date)}
                />
              </PickerRow>
            </>
          ) : (
            <>
              <PickerTriggerRow
                label="Check-in"
                value={checkInAt.toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                })}
                onPress={() => setAndroidPickerMode("check-in")}
              />
              <PickerTriggerRow
                label="Expected end"
                value={expectedEndAt.toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                })}
                onPress={() => setAndroidPickerMode("end")}
              />
              {androidPickerMode && (
                <DateTimePicker
                  value={
                    androidPickerMode === "check-in" ? checkInAt : expectedEndAt
                  }
                  mode="time"
                  display="default"
                  minuteInterval={15}
                  onChange={(_, date) => pickTime(androidPickerMode, date)}
                />
              )}
            </>
          )}
          <Input
            placeholder="Code word (optional)"
            value={codeWord}
            onChangeText={(value) => {
              setPlanDirty(true);
              setCodeWord(value);
            }}
          />
          <Input
            placeholder="Note for your circle (optional)"
            value={circleNote}
            onChangeText={(value) => {
              setPlanDirty(true);
              setCircleNote(value);
            }}
            multiline
          />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: 10,
              padding: 12,
              backgroundColor: c.background,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: c.foreground,
                  fontSize: 14,
                  fontWeight: "600",
                }}
              >
                Date-only location intent
              </Text>
              <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
                The Date Card says location is date-only if you turn it on.
              </Text>
            </View>
            <Switch
              value={shareLiveLocation}
              onValueChange={(value) => {
                setPlanDirty(true);
                setShareLiveLocation(value);
              }}
              trackColor={{ true: c.primary, false: c.muted }}
            />
          </View>
          <View
            style={{
              borderWidth: 1,
              borderColor: coverModeEnabled ? c.primary : c.border,
              borderRadius: 10,
              padding: 12,
              gap: 10,
              backgroundColor: c.background,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={{
                    color: c.foreground,
                    fontSize: 14,
                    fontWeight: "600",
                  }}
                >
                  Cover Mode
                </Text>
                <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
                  Pick the harmless screen for this specific date.
                </Text>
              </View>
              <Switch
                value={coverModeEnabled}
                onValueChange={(value) => {
                  setPlanDirty(true);
                  setCoverModeEnabled(value);
                  if (value && !coverModeTheme) setCoverModeTheme("clock");
                }}
                trackColor={{ true: c.primary, false: c.muted }}
              />
            </View>
            {coverModeEnabled && (
              <View style={{ gap: 8 }}>
                {COVER_MODE_OPTIONS.map((option) => {
                  const selected = coverModeTheme === option.id;
                  return (
                    <Pressable
                      key={option.id}
                      onPress={() => {
                        setPlanDirty(true);
                        setCoverModeTheme(option.id);
                      }}
                      style={({ pressed }) => ({
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 9,
                        borderWidth: 1,
                        borderColor: selected ? c.primary : c.border,
                        borderRadius: 10,
                        padding: 10,
                        backgroundColor: selected ? c.secondary : c.card,
                        opacity: pressed ? 0.72 : 1,
                      })}
                    >
                      <Feather
                        name={option.icon}
                        size={16}
                        color={selected ? c.primary : c.mutedForeground}
                      />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text
                          style={{
                            color: c.foreground,
                            fontSize: 13,
                            fontWeight: "600",
                          }}
                        >
                          {option.label}
                        </Text>
                        <Text
                          style={{ color: c.mutedForeground, fontSize: 11 }}
                        >
                          {option.detail}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
          <View
            style={{
              borderWidth: 1,
              borderColor: checklistProgress.ready ? c.success : c.border,
              borderRadius: 10,
              padding: 12,
              gap: 10,
              backgroundColor: c.background,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 8,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: c.foreground,
                  fontSize: 14,
                  fontWeight: "600",
                }}
              >
                Safe date walkthrough
              </Text>
              <Text
                style={{
                  color: checklistProgress.ready ? c.success : c.warning,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {checklistProgress.completed}/{checklistProgress.total}
              </Text>
            </View>
            {SAFE_DATE_CHECKLIST_ITEMS.map((item) => {
              const checked = safeDateChecklist[item.key];
              return (
                <Pressable
                  key={item.key}
                  onPress={() => toggleChecklist(item.key)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 9,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Feather
                    name={checked ? "check-circle" : "circle"}
                    size={18}
                    color={checked ? c.success : c.mutedForeground}
                  />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={{
                        color: c.foreground,
                        fontSize: 13,
                        fontWeight: "600",
                      }}
                    >
                      {item.label}
                    </Text>
                    <Text
                      style={{
                        color: c.mutedForeground,
                        fontSize: 11,
                        lineHeight: 15,
                      }}
                    >
                      {item.detail}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <View
            style={{
              padding: 12,
              backgroundColor: c.muted,
              borderRadius: 10,
              gap: 6,
            }}
          >
            <Text
              style={{
                color: c.mutedForeground,
                fontSize: 11,
                fontWeight: "600",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Preview
            </Text>
            <Text
              selectable
              style={{ color: c.foreground, fontSize: 12, lineHeight: 18 }}
            >
              {buildDateCardMessage(previewMatch)}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              label="Save"
              icon="save"
              onPress={save}
              loading={saving}
              style={{ flex: 1 }}
            />
            <Button
              label="Clear"
              onPress={clear}
              loading={clearing}
              disabled={!plan}
              variant="ghost"
            />
          </View>
        </View>
      )}
      <View
        style={{
          height: 1,
          backgroundColor: c.border,
          marginVertical: 12,
        }}
      />
      <View style={{ gap: 4, marginBottom: 10 }}>
        <Text
          style={{
            color: c.foreground,
            fontSize: 14,
            fontWeight: "700",
          }}
        >
          Circle Check
        </Text>
        <Body muted style={{ fontSize: 12, lineHeight: 17 }}>
          These send only when you choose to share. Use "Need exit" for backup,
          not emergency response.
        </Body>
      </View>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button
            label="I'm safe"
            icon="check-circle"
            onPress={() =>
              updateCircleStatus(
                "safe",
                buildCircleCheckMessage(shareTarget, "safe"),
              )
            }
            loading={circleChecking}
            disabled={circleActionDisabled}
            variant="ghost"
            style={{ flex: 1 }}
            small
          />
          <Button
            label="Need exit"
            icon="phone"
            onPress={() =>
              updateCircleStatus(
                "needs_help",
                buildSoftExitMessage(shareTarget, "call"),
              )
            }
            disabled={circleActionDisabled}
            variant="ghost"
            style={{ flex: 1 }}
            small
          />
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button
            label="Pickup"
            icon="navigation"
            onPress={() =>
              updateCircleStatus(
                "needs_help",
                buildSoftExitMessage(shareTarget, "pickup"),
              )
            }
            disabled={circleActionDisabled}
            variant="ghost"
            style={{ flex: 1 }}
            small
          />
          <Button
            label="Text me"
            icon="message-circle"
            onPress={() =>
              updateCircleStatus(
                "needs_help",
                buildSoftExitMessage(shareTarget, "text"),
              )
            }
            disabled={circleActionDisabled}
            variant="ghost"
            style={{ flex: 1 }}
            small
          />
        </View>
      </View>
    </Card>
  );
}

function NextDateCard({
  match,
  onChange,
}: {
  match: MatchDetail;
  onChange: () => void;
}) {
  const c = useColors();
  const [briefLoading, setBriefLoading] = useState(false);
  const [clearing, setClearing] = useState(false);

  const savedBrief = match.lastDateBrief;
  const freshness = match.dateBriefFreshness;
  const pendingAnalysis =
    match.pendingScreenshotCount + match.failedScreenshotCount;
  const hasUnanalyzedScreens =
    match.analysisFreshness !== "current" && pendingAnalysis > 0;

  const loadBrief = async () => {
    setBriefLoading(true);
    try {
      await generateDateBrief(match.id);
      onChange();
    } catch (e: any) {
      Alert.alert("Couldn't generate brief", e?.message ?? "Try again.");
    } finally {
      setBriefLoading(false);
    }
  };

  const briefAgeLabel = (() => {
    if (!savedBrief) return null;
    const ms = Date.now() - new Date(savedBrief.generatedAt).getTime();
    const days = Math.floor(ms / 86_400_000);
    const hours = Math.floor(ms / 3_600_000);
    if (days >= 1) return `${days}d ago`;
    if (hours >= 1) return `${hours}h ago`;
    const mins = Math.max(1, Math.floor(ms / 60_000));
    return `${mins}m ago`;
  })();

  const staleReason = (() => {
    if (freshness !== "stale" || !savedBrief) return null;
    const doneShots = match.screenshots.filter(
      (s) => s.extractionStatus === "done",
    ).length;
    const newShots = doneShots - savedBrief.screenshotCountAt;
    if (newShots > 0) {
      return `${newShots} new screenshot${newShots === 1 ? "" : "s"} since`;
    }
    const ageDays =
      (Date.now() - new Date(savedBrief.generatedAt).getTime()) / 86_400_000;
    if (ageDays > 5) return "Older than 5 days";
    return "Date details updated";
  })();

  const briefStatusLabel = hasUnanalyzedScreens
    ? `${pendingAnalysis} screenshot${pendingAnalysis === 1 ? "" : "s"} not analyzed`
    : freshness === "missing"
      ? "Needs date brief"
      : freshness === "stale"
        ? (staleReason ?? "Brief needs refresh")
        : "Brief ready";
  const briefStatusWarning = hasUnanalyzedScreens || freshness !== "current";
  const briefStatusColor = briefStatusWarning ? c.warning : c.success;
  const briefStatusBg = briefStatusWarning ? c.warningBg : c.successBg;
  const briefStatusIcon = briefStatusWarning ? "alert-circle" : "check";
  const briefActionLabel =
    freshness === "current" && savedBrief
      ? "Refresh brief"
      : "Generate date brief";

  const clearDate = async () => {
    setClearing(true);
    try {
      await updateMatch(match.id, {
        nextDateAt: null,
        nextDateLocation: null,
        nextDateOutfit: null,
        dateSafetyPlan: null,
      });
      cancelDateDayReminder(match.id).catch(() => {});
      cancelDateSafetyReminders(match.id).catch(() => {});
      onChange();
    } catch (e: any) {
      Alert.alert("Couldn't clear", e?.message ?? "Try again.");
    } finally {
      setClearing(false);
    }
  };

  return (
    <Card style={{ borderColor: c.primary, borderWidth: 2 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <Feather name="calendar" size={16} color={c.primary} />
        <Text
          style={{
            fontSize: 13,
            fontWeight: "600",
            color: c.primary,
          }}
        >
          UPCOMING DATE
        </Text>
      </View>
      <Text
        style={{
          fontSize: 18,
          fontWeight: "700",
          color: c.foreground,
        }}
      >
        {formatDateTime(match.nextDateAt)}
      </Text>
      {match.nextDateLocation && (
        <Text style={{ fontSize: 13, color: c.mutedForeground, marginTop: 2 }}>
          {match.nextDateLocation}
        </Text>
      )}
      {match.nextDateOutfit && (
        <View
          style={{
            marginTop: 8,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 10,
            paddingVertical: 6,
            backgroundColor: c.muted,
            borderRadius: 8,
            alignSelf: "flex-start",
          }}
        >
          <Feather name="bookmark" size={12} color={c.foreground} />
          <Text style={{ fontSize: 12, color: c.foreground }}>
            Outfit: {match.nextDateOutfit}
          </Text>
        </View>
      )}
      <View
        style={{
          marginTop: 10,
          alignSelf: "flex-start",
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          paddingHorizontal: 9,
          paddingVertical: 5,
          borderRadius: 999,
          backgroundColor: briefStatusBg,
        }}
      >
        <Feather name={briefStatusIcon} size={12} color={briefStatusColor} />
        <Text
          style={{
            fontSize: 11,
            fontWeight: "600",
            color: briefStatusColor,
          }}
        >
          {briefStatusLabel}
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        <Button
          label={briefActionLabel}
          icon="zap"
          onPress={loadBrief}
          loading={briefLoading}
          style={{ flex: 1 }}
        />
        <Button
          label="Clear"
          onPress={clearDate}
          loading={clearing}
          variant="ghost"
        />
      </View>
      {savedBrief && (
        <View
          style={{
            marginTop: 12,
            padding: 12,
            backgroundColor: c.muted,
            borderRadius: 10,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "600",
                color: c.mutedForeground,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Prep brief · {briefAgeLabel}
            </Text>
            {briefStatusWarning ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 999,
                  backgroundColor: c.warningBg ?? c.muted,
                }}
              >
                <Feather
                  name="refresh-cw"
                  size={10}
                  color={c.warning ?? c.primary}
                />
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "600",
                    color: c.warning ?? c.primary,
                  }}
                >
                  {briefStatusLabel}
                </Text>
              </View>
            ) : (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 999,
                  backgroundColor: c.muted,
                }}
              >
                <Feather name="check" size={10} color={c.success} />
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "600",
                    color: c.success,
                  }}
                >
                  Up to date
                </Text>
              </View>
            )}
          </View>
          <Body style={{ fontSize: 13, lineHeight: 19 }}>
            {savedBrief.brief}
          </Body>
        </View>
      )}
    </Card>
  );
}

function PostDateDebriefCard({
  match,
  onChange,
}: {
  match: MatchDetail;
  onChange: () => void;
}) {
  const c = useColors();
  const [recap, setRecap] = useState("");
  const [feltSense, setFeltSense] = useState("");
  const [boundarySignals, setBoundarySignals] = useState("");
  const [mismatchSignals, setMismatchSignals] = useState("");
  const [greenSignals, setGreenSignals] = useState("");
  const [saving, setSaving] = useState(false);
  const [skipping, setSkipping] = useState(false);

  const log = async () => {
    const combined = [
      recap.trim() ? `Recap: ${recap.trim()}` : null,
      feltSense.trim()
        ? `How did you feel in your body? ${feltSense.trim()}`
        : null,
      boundarySignals.trim()
        ? `Any boundary pressure? ${boundarySignals.trim()}`
        : null,
      mismatchSignals.trim()
        ? `Any mismatch between text and in-person? ${mismatchSignals.trim()}`
        : null,
      greenSignals.trim() ? `What went well? ${greenSignals.trim()}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    if (!combined.trim()) {
      Alert.alert(
        "How'd it go?",
        "Add a quick recap or answer one debrief prompt.",
      );
      return;
    }
    setSaving(true);
    try {
      const entry: DateHistoryEntry = {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
        when: match.nextDateAt!,
        location: match.nextDateLocation ?? "",
        recap: combined,
        createdAt: new Date().toISOString(),
      };
      await updateMatch(match.id, {
        dateHistory: [...match.dateHistory, entry],
        nextDateAt: null,
        nextDateLocation: null,
        nextDateOutfit: null,
        dateSafetyPlan: null,
      });
      cancelDateDayReminder(match.id).catch(() => {});
      cancelDateSafetyReminders(match.id).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      onChange();
      setRecap("");
      setFeltSense("");
      setBoundarySignals("");
      setMismatchSignals("");
      setGreenSignals("");
    } catch (e: any) {
      Alert.alert("Couldn't save", e?.message ?? "Try again.");
    } finally {
      setSaving(false);
    }
  };

  const skip = async () => {
    setSkipping(true);
    try {
      await updateMatch(match.id, {
        nextDateAt: null,
        nextDateLocation: null,
        nextDateOutfit: null,
        dateSafetyPlan: null,
      });
      cancelDateDayReminder(match.id).catch(() => {});
      cancelDateSafetyReminders(match.id).catch(() => {});
      onChange();
    } catch (e: any) {
      Alert.alert("Couldn't clear", e?.message ?? "Try again.");
    } finally {
      setSkipping(false);
    }
  };

  return (
    <Card
      style={{ backgroundColor: c.accent, borderColor: c.accentForeground }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <Feather name="check-circle" size={16} color={c.accentForeground} />
        <Text
          style={{
            fontSize: 13,
            fontWeight: "600",
            color: c.accentForeground,
          }}
        >
          HOW DID THE DATE GO?
        </Text>
      </View>
      <Body muted style={{ marginBottom: 10 }}>
        Your date on {formatDateTime(match.nextDateAt)} has passed.
      </Body>
      <Input
        placeholder="Quick recap — vibe, highlights, next move..."
        value={recap}
        onChangeText={setRecap}
        multiline
      />
      <View style={{ gap: 8, marginTop: 8 }}>
        <Input
          placeholder="How did you feel in your body?"
          value={feltSense}
          onChangeText={setFeltSense}
          multiline
        />
        <Input
          placeholder="Any boundary pressure?"
          value={boundarySignals}
          onChangeText={setBoundarySignals}
          multiline
        />
        <Input
          placeholder="Any mismatch between text and in-person?"
          value={mismatchSignals}
          onChangeText={setMismatchSignals}
          multiline
        />
        <Input
          placeholder="What went well?"
          value={greenSignals}
          onChangeText={setGreenSignals}
          multiline
        />
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
        <Button
          label="Log it"
          icon="save"
          onPress={log}
          loading={saving}
          style={{ flex: 1 }}
        />
        <Button
          label="Didn't happen"
          onPress={skip}
          loading={skipping}
          variant="ghost"
        />
      </View>
      {match.dateHistory.length > 0 && (
        <View
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: c.border,
          }}
        >
          <SectionLabel>Past dates</SectionLabel>
          {match.dateHistory
            .slice()
            .reverse()
            .slice(0, 3)
            .map((d) => (
              <View key={d.id} style={{ marginBottom: 8 }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: c.foreground,
                  }}
                >
                  {formatDateTime(d.when)}
                  {d.location ? ` · ${d.location}` : ""}
                </Text>
                <Body muted style={{ fontSize: 12 }}>
                  {d.recap}
                </Body>
              </View>
            ))}
        </View>
      )}
    </Card>
  );
}

function ScreenshotsCard({
  match,
  onChange,
}: {
  match: MatchDetail;
  onChange: () => void;
}) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const { upload, uploading } = useScreenshotUpload({ match, onChange });

  return (
    <Card>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          setOpen((v) => !v);
        }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Feather name="image" size={16} color={c.mutedForeground} />
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: c.foreground,
              letterSpacing: 1.2,
              textTransform: "uppercase",
            }}
          >
            Conversation log ({match.screenshots.length})
          </Text>
        </View>
        <Feather
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={c.mutedForeground}
        />
      </Pressable>
      {open && (
        <View style={{ marginTop: 14, gap: 12 }}>
          {match.screenshots.length === 0 ? (
            <Body muted>No screenshots yet.</Body>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginHorizontal: -16 }}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
            >
              {match.screenshots.map((s) => {
                const url = objectPathToUrl(s.objectPath);
                return (
                  <View key={s.id} style={{ alignItems: "center", gap: 4 }}>
                    {url && (
                      <Image
                        source={url}
                        style={{
                          width: 140,
                          height: 240,
                          borderRadius: 12,
                          backgroundColor: c.muted,
                        }}
                        contentFit="cover"
                      />
                    )}
                    {!url && (
                      <View
                        style={{
                          width: 140,
                          height: 240,
                          borderRadius: 12,
                          backgroundColor: c.muted,
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          padding: 12,
                        }}
                      >
                        <Feather
                          name="check-circle"
                          size={22}
                          color={c.success}
                        />
                        <Text
                          style={{
                            color: c.mutedForeground,
                            fontSize: 12,
                            fontWeight: "600",
                            textAlign: "center",
                          }}
                        >
                          Analyzed
                        </Text>
                      </View>
                    )}
                    <Text style={{ fontSize: 10, color: c.mutedForeground }}>
                      {formatTimeAgo(s.uploadedAt)}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          )}
          <Button
            label="Add screenshots"
            icon="plus"
            onPress={upload}
            loading={uploading}
            variant="secondary"
          />
        </View>
      )}
    </Card>
  );
}

function TranscriptCard({
  match,
  onChange,
}: {
  match: MatchDetail;
  onChange: () => void;
}) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          setOpen((v) => !v);
        }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Feather name="message-square" size={16} color={c.mutedForeground} />
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: c.foreground,
              letterSpacing: 1.2,
              textTransform: "uppercase",
            }}
          >
            Transcript ({match.transcript.length})
          </Text>
        </View>
        <Feather
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={c.mutedForeground}
        />
      </Pressable>
      {open && (
        <View style={{ marginTop: 14, gap: 6 }}>
          {match.transcript.length === 0 ? (
            <Body muted>No transcript extracted yet.</Body>
          ) : (
            match.transcript.map((t, i) => (
              <View
                key={i}
                style={{
                  alignSelf: t.speaker === "me" ? "flex-end" : "flex-start",
                  maxWidth: "85%",
                  backgroundColor: t.speaker === "me" ? c.primary : c.muted,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 14,
                  borderBottomRightRadius: t.speaker === "me" ? 4 : 14,
                  borderBottomLeftRadius: t.speaker === "her" ? 4 : 14,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color:
                      t.speaker === "me" ? c.primaryForeground : c.foreground,
                  }}
                >
                  {t.text}
                </Text>
              </View>
            ))
          )}
        </View>
      )}
    </Card>
  );
}

function NotesCard({
  match,
  onChange,
}: {
  match: MatchDetail;
  onChange: () => void;
}) {
  const c = useColors();
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(match.notes);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateMatch(match.id, { notes });
      onChange();
      setEditing(false);
    } catch (e: any) {
      Alert.alert("Couldn't save notes", e?.message ?? "Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <SectionLabel>Notes</SectionLabel>
        {editing ? (
          <IconButton
            icon={saving ? "loader" : "check"}
            onPress={save}
            color={c.primary}
            size={16}
            hint="Save notes"
          />
        ) : (
          <IconButton
            icon="edit-2"
            onPress={() => setEditing(true)}
            color={c.mutedForeground}
            size={16}
            hint="Edit notes"
          />
        )}
      </View>
      {editing ? (
        <Input
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder="Private notes about this match..."
        />
      ) : match.notes ? (
        <Body>{match.notes}</Body>
      ) : (
        <Body muted>Tap the pencil to add private notes.</Body>
      )}
    </Card>
  );
}

function StatusActionsCard({
  match,
  onChange,
  onArchived,
  onDeleted,
}: {
  match: MatchDetail;
  onChange: () => void;
  onArchived: () => void;
  onDeleted: () => void;
}) {
  const c = useColors();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<MatchStatus | null>(null);
  const [deleting, setDeleting] = useState(false);

  const set = (status: MatchStatus) => {
    Alert.alert(
      `Mark as ${status}?`,
      status === "active"
        ? "Reactivate this match."
        : "It'll be hidden from the active list.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          style: status === "active" ? "default" : "destructive",
          onPress: async () => {
            setBusy(status);
            try {
              await updateMatch(match.id, { status });
              await qc.invalidateQueries({
                queryKey: getListMatchesQueryKey(),
              });
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              ).catch(() => {});
              if (status !== "active") onArchived();
              else onChange();
            } catch (e: any) {
              Alert.alert("Couldn't update status", e?.message ?? "Try again.");
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  const confirmDelete = () => {
    Alert.alert(
      `Delete ${match.name}?`,
      "This removes the connection, screenshots, chat history, notes, dates, scores, and tags. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteMatch(match.id);
              qc.removeQueries({ queryKey: getGetMatchQueryKey(match.id) });
              await Promise.all([
                qc.invalidateQueries({ queryKey: getListMatchesQueryKey() }),
                qc.invalidateQueries({
                  queryKey: getListChatConversationsQueryKey(),
                }),
              ]);
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              ).catch(() => {});
              onDeleted();
            } catch (e: any) {
              Alert.alert(
                "Couldn't delete connection",
                e?.message ?? "Try again.",
              );
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Card>
      <SectionLabel>Status</SectionLabel>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {match.status !== "active" && (
          <Button
            label="Reactivate"
            icon="rotate-ccw"
            onPress={() => set("active")}
            loading={busy === "active"}
            style={{ flex: 1 }}
          />
        )}
        {match.status !== "archived" && (
          <Button
            label="Archive"
            icon="archive"
            onPress={() => set("archived")}
            loading={busy === "archived"}
            variant="ghost"
            style={{ flex: 1 }}
          />
        )}
        {match.status !== "ghosted" && (
          <Button
            label="Ghosted"
            icon="moon"
            onPress={() => set("ghosted")}
            loading={busy === "ghosted"}
            variant="ghost"
            style={{ flex: 1 }}
          />
        )}
      </View>
      <View
        style={{
          height: 1,
          backgroundColor: c.border,
          marginVertical: 14,
        }}
      />
      <Button
        label="Delete connection"
        icon="trash-2"
        onPress={confirmDelete}
        loading={deleting}
        disabled={busy !== null}
        variant="destructive"
      />
    </Card>
  );
}

/* ------------------------------ Input ------------------------------------ */

function Input(props: React.ComponentProps<typeof TextInput>) {
  const c = useColors();
  return (
    <TextInput
      placeholderTextColor={c.mutedForeground}
      {...props}
      style={[
        {
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: 14,
          fontWeight: "400",
          color: c.foreground,
          backgroundColor: c.background,
          minHeight: props.multiline ? 80 : undefined,
          textAlignVertical: props.multiline ? "top" : "center",
        },
        props.style,
      ]}
    />
  );
}
