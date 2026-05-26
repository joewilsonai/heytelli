import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import {
  addScreenshot,
  createOpenrouterConversation,
  deleteMatch,
  generateDateBrief,
  generateMatchReplies,
  getGetMatchQueryKey,
  getListMatchesQueryKey,
  getListOpenrouterConversationsQueryKey,
  rescoreMatch,
  updateMatch,
  useGetMatch,
} from "@workspace/api-client-react";
import type {
  DateBriefResult,
  DateHistoryEntry,
  MatchDetail,
  MatchStatus,
  ReplyResult,
  TranscriptTurn,
} from "@workspace/api-client-react";

import {
  Body,
  Button,
  Card,
  EmptyState,
  H2,
  IconButton,
  SectionLabel,
  Skeleton,
  StatusPill,
  VibeTag,
} from "@/components/ui";
import { VoiceDebriefSheet } from "@/components/VoiceDebriefSheet";
import { VoiceNoteFeedbackSheet } from "@/components/VoiceNoteFeedbackSheet";
import { InPersonRecordingSheet } from "@/components/InPersonRecordingSheet";
import { RedFlagsCard } from "@/components/RedFlagsCard";
import { CheatSheetCard } from "@/components/CheatSheetCard";
import { TagsRow } from "@/components/TagsRow";
import { TagHistoryCard } from "@/components/TagHistoryCard";
import { ResponseStatsCard } from "@/components/ResponseStatsCard";
import { addDateToCalendar } from "@/lib/calendar";
import {
  cancelDateDayReminder,
  scheduleDateDayReminder,
} from "@/lib/notifications";
import { formatDateTime, formatTimeAgo, isPast } from "@/lib/format";
import { objectPathToUrl } from "@/lib/image";
import { MAX_SHARED_SCREENSHOTS } from "@/lib/share-intake";
import { uploadImage } from "@/lib/upload";

export default function MatchDetailScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const matchId = Number(id);
  const { data, isLoading, refetch, isRefetching, error } =
    useGetMatch(matchId);

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
      </View>
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
        <HeaderCard match={data} onChange={() => refetch()} />
        <ScreenshotIntakeCard match={data} onChange={() => refetch()} />
        <LatestReadCard match={data} onChange={() => refetch()} />
        <RedFlagsCard
          matchId={data.id}
          promoted
          initialSummary={data.redFlagSummary}
        />
        <ResponseStatsCard matchId={data.id} />
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
        {isPast(data.nextDateAt) && data.nextDateAt && (
          <PostDateDebriefCard match={data} onChange={() => refetch()} />
        )}
        {data.nextDateAt && !isPast(data.nextDateAt) && (
          <NextDateCard match={data} onChange={() => refetch()} />
        )}
        {!data.nextDateAt && (
          <ScheduleDateCard match={data} onChange={() => refetch()} />
        )}
        <CheatSheetCard matchId={data.id} />
        <RepliesCard matchId={data.id} />
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
              fontFamily: "Inter_500Medium",
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
              fontFamily: "Inter_600SemiBold",
              color: c.foreground,
            }}
          >
            Voice debrief
          </Text>
          <Text
            style={{ fontSize: 12, color: c.mutedForeground, marginTop: 2 }}
          >
            Talk it out — Grok transcribes, flags, and updates scores
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
              fontFamily: "Inter_600SemiBold",
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
              fontFamily: "Inter_600SemiBold",
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
      const created = await createOpenrouterConversation({
        title: `Chat about ${matchName}`,
        matchId,
      });
      qc.invalidateQueries({
        queryKey: getListOpenrouterConversationsQueryKey(),
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
            fontFamily: "Inter_600SemiBold",
            color: c.accentForeground,
          }}
        >
          Chat with Grok about {matchName}
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: c.accentForeground,
            opacity: 0.7,
            marginTop: 2,
          }}
        >
          Brainstorm next moves, decode her vibe
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

function HeaderCard({
  match,
  onChange,
}: {
  match: MatchDetail;
  onChange: () => void;
}) {
  const c = useColors();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(match.name);
  const [saving, setSaving] = useState(false);
  const photo = objectPathToUrl(match.photoObjectPath);

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
                  fontFamily: "Inter_700Bold",
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
                  fontFamily: "Inter_700Bold",
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
      <Text
        style={{ fontSize: 11, color: tint, fontFamily: "Inter_600SemiBold" }}
      >
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
            fontFamily: "Inter_700Bold",
            color: c.primaryForeground,
          }}
          numberOfLines={1}
        >
          Upload screenshots
        </Text>
        <Text
          style={{
            fontSize: 13,
            fontFamily: "Inter_500Medium",
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
              fontFamily: "Inter_600SemiBold",
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
              fontFamily: "Inter_600SemiBold",
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

function ScheduleDateCard({
  match,
  onChange,
}: {
  match: MatchDetail;
  onChange: () => void;
}) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState("");
  const [where, setWhere] = useState("");
  const [outfit, setOutfit] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!when.trim()) {
      Alert.alert(
        "When?",
        "Enter a date/time like 'Friday 7pm' or '2026-06-01 19:00'.",
      );
      return;
    }
    const parsed = new Date(when);
    if (Number.isNaN(parsed.getTime())) {
      Alert.alert(
        "Couldn't read that time",
        "Try a format like 2026-06-01 19:00 or June 1, 2026 7:00 PM.",
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
      setWhen("");
      setWhere("");
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
        <View style={{ gap: 8 }}>
          <Input
            placeholder="When (e.g. 2026-06-01 19:00)"
            value={when}
            onChangeText={setWhen}
          />
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

  const readStatusLabel = hasUnanalyzedScreens
    ? `${pendingAnalysis} screenshot${pendingAnalysis === 1 ? "" : "s"} not analyzed`
    : freshness === "stale"
      ? (staleReason ?? "Needs refresh")
      : "Up to date";
  const readStatusWarning = hasUnanalyzedScreens || freshness === "stale";

  const clearDate = async () => {
    setClearing(true);
    try {
      await updateMatch(match.id, { nextDateAt: null, nextDateLocation: null });
      cancelDateDayReminder(match.id).catch(() => {});
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
            fontFamily: "Inter_600SemiBold",
            color: c.primary,
          }}
        >
          UPCOMING DATE
        </Text>
      </View>
      <Text
        style={{
          fontSize: 18,
          fontFamily: "Inter_700Bold",
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
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        <Button
          label={savedBrief ? "Refresh brief" : "AI prep brief"}
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
                fontFamily: "Inter_600SemiBold",
                color: c.mutedForeground,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Prep brief · {briefAgeLabel}
            </Text>
            {readStatusWarning ? (
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
                    fontFamily: "Inter_600SemiBold",
                    color: c.warning ?? c.primary,
                  }}
                >
                  {readStatusLabel}
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
                    fontFamily: "Inter_600SemiBold",
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
  const [saving, setSaving] = useState(false);
  const [skipping, setSkipping] = useState(false);

  const log = async () => {
    if (!recap.trim()) {
      Alert.alert(
        "How'd it go?",
        "Add a quick recap (or tap 'Didn't happen').",
      );
      return;
    }
    setSaving(true);
    try {
      const entry: DateHistoryEntry = {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
        when: match.nextDateAt!,
        location: match.nextDateLocation ?? "",
        recap: recap.trim(),
        createdAt: new Date().toISOString(),
      };
      await updateMatch(match.id, {
        dateHistory: [...match.dateHistory, entry],
        nextDateAt: null,
        nextDateLocation: null,
      });
      cancelDateDayReminder(match.id).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      onChange();
      setRecap("");
    } catch (e: any) {
      Alert.alert("Couldn't save", e?.message ?? "Try again.");
    } finally {
      setSaving(false);
    }
  };

  const skip = async () => {
    setSkipping(true);
    try {
      await updateMatch(match.id, { nextDateAt: null, nextDateLocation: null });
      cancelDateDayReminder(match.id).catch(() => {});
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
            fontFamily: "Inter_600SemiBold",
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
                    fontFamily: "Inter_600SemiBold",
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

function RepliesCard({ matchId }: { matchId: number }) {
  const c = useColors();
  const [replies, setReplies] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const res: ReplyResult = await generateMatchReplies(matchId);
      setReplies(res.replies);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
    } catch (e: any) {
      Alert.alert("Couldn't generate replies", e?.message ?? "Try again.");
    } finally {
      setLoading(false);
    }
  };

  const copy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );
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
        <SectionLabel>Reply suggestions</SectionLabel>
        <IconButton
          icon={loading ? "loader" : "refresh-cw"}
          onPress={generate}
          color={c.mutedForeground}
          size={16}
          hint="Generate replies"
        />
      </View>
      {replies.length === 0 ? (
        <Button
          label="Generate 3 replies"
          icon="message-circle"
          onPress={generate}
          loading={loading}
          variant="secondary"
        />
      ) : (
        <View style={{ gap: 8 }}>
          {replies.map((r, i) => (
            <Pressable
              key={i}
              onLongPress={() => copy(r)}
              onPress={() => copy(r)}
              style={({ pressed }) => ({
                padding: 12,
                backgroundColor: c.muted,
                borderRadius: 12,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Body style={{ fontSize: 13 }}>{r}</Body>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  marginTop: 6,
                }}
              >
                <Feather name="copy" size={11} color={c.mutedForeground} />
                <Text style={{ fontSize: 10, color: c.mutedForeground }}>
                  Tap to copy
                </Text>
              </View>
            </Pressable>
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
              fontFamily: "Inter_600SemiBold",
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
                            fontFamily: "Inter_600SemiBold",
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
              fontFamily: "Inter_600SemiBold",
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
                  queryKey: getListOpenrouterConversationsQueryKey(),
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
          fontFamily: "Inter_400Regular",
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
