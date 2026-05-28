import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import { Alert, Share, Switch, Text, TextInput, View } from "react-native";

import { Body, Button, Card, SectionLabel } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import {
  buildGutCheckMessage,
  buildGutCheckNoteAppend,
  getGutCheckContextPreview,
} from "@/lib/gut-check-card";
import { updateMatch } from "@workspace/api-client-react";
import type { MatchDetail } from "@workspace/api-client-react";

export function GutCheckCard({
  match,
  onChange,
}: {
  match: MatchDetail;
  onChange: () => void;
}) {
  const c = useColors();
  const [note, setNote] = useState("");
  const [question, setQuestion] = useState("");
  const [circleNote, setCircleNote] = useState("");
  const [maskName, setMaskName] = useState(false);
  const [includeDate, setIncludeDate] = useState(Boolean(match.nextDateAt));
  const [includeTimeline, setIncludeTimeline] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [savingCircleNote, setSavingCircleNote] = useState(false);
  const [sharedOnce, setSharedOnce] = useState(false);

  const preview = useMemo(
    () => getGutCheckContextPreview(match, { maskName }),
    [maskName, match],
  );
  const message = useMemo(
    () =>
      buildGutCheckMessage(match, {
        note,
        question,
        includeDate,
        includeTimeline,
        maskName,
      }),
    [includeDate, includeTimeline, maskName, match, note, question],
  );
  const hasTimeline = preview.timelineHighlights.length > 0;
  const hasDate = preview.hasDateContext;
  const canShare = note.trim().length > 0 || question.trim().length > 0;
  const canSaveCircleNote = circleNote.trim().length > 0;

  const shareGutCheck = async () => {
    if (!canShare) {
      Alert.alert(
        "Add a gut check",
        "Write what happened or what you want your circle to weigh in on.",
      );
      return;
    }
    setSharing(true);
    try {
      const result = await Share.share({ message });
      if (result.action === Share.sharedAction) {
        setSharedOnce(true);
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
      }
    } catch (e: any) {
      Alert.alert("Couldn't share", e?.message ?? "Try again.");
    } finally {
      setSharing(false);
    }
  };

  const saveCircleNote = async () => {
    if (!canSaveCircleNote) return;
    setSavingCircleNote(true);
    try {
      const append = buildGutCheckNoteAppend({ note: circleNote });
      const existing = match.notes?.trim();
      await updateMatch(match.id, {
        notes: existing ? `${existing}\n\n${append}` : append,
      });
      setCircleNote("");
      onChange();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
    } catch (e: any) {
      Alert.alert("Couldn't save Circle Note", e?.message ?? "Try again.");
    } finally {
      setSavingCircleNote(false);
    }
  };

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.primary,
          }}
        >
          <Feather name="heart" size={16} color={c.primaryForeground} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <SectionLabel>Gut Check</SectionLabel>
          <Text
            style={{ color: c.foreground, fontSize: 16, fontWeight: "700" }}
          >
            Send this to your circle
          </Text>
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <TextInput
          placeholder="What happened?"
          placeholderTextColor={c.mutedForeground}
          value={note}
          onChangeText={setNote}
          multiline
          style={{
            minHeight: 76,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 12,
            backgroundColor: c.background,
            color: c.foreground,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 14,
            lineHeight: 20,
            textAlignVertical: "top",
          }}
        />
        <TextInput
          placeholder="What do you want checked?"
          placeholderTextColor={c.mutedForeground}
          value={question}
          onChangeText={setQuestion}
          style={{
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 12,
            backgroundColor: c.background,
            color: c.foreground,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 14,
          }}
        />
      </View>

      <View style={{ gap: 8 }}>
        <GutCheckToggle
          label={`Show as ${maskName ? "Someone" : preview.displayName}`}
          value={!maskName}
          onValueChange={(value) => setMaskName(!value)}
        />
        <GutCheckToggle
          label="Include date info"
          value={includeDate}
          disabled={!hasDate}
          onValueChange={setIncludeDate}
        />
        <GutCheckToggle
          label="Include recent context"
          value={includeTimeline}
          disabled={!hasTimeline}
          onValueChange={setIncludeTimeline}
        />
      </View>

      <View
        style={{
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: 12,
          backgroundColor: c.muted,
          padding: 12,
          gap: 6,
        }}
      >
        <Text
          style={{
            color: c.mutedForeground,
            fontSize: 11,
            fontWeight: "700",
            textTransform: "uppercase",
          }}
        >
          Preview
        </Text>
        <Text
          selectable
          style={{ color: c.foreground, fontSize: 12, lineHeight: 18 }}
        >
          {message}
        </Text>
      </View>

      <Button
        label="Share Gut Check"
        icon="share"
        onPress={shareGutCheck}
        loading={sharing}
      />

      {sharedOnce && (
        <View style={{ gap: 8 }}>
          <Body muted style={{ fontSize: 12 }}>
            Circle Note
          </Body>
          <TextInput
            placeholder="What did your circle say?"
            placeholderTextColor={c.mutedForeground}
            value={circleNote}
            onChangeText={setCircleNote}
            multiline
            style={{
              minHeight: 68,
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: 12,
              backgroundColor: c.background,
              color: c.foreground,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 14,
              lineHeight: 20,
              textAlignVertical: "top",
            }}
          />
          <Button
            label="Save Circle Note"
            icon="save"
            variant="secondary"
            onPress={saveCircleNote}
            loading={savingCircleNote}
            disabled={!canSaveCircleNote}
          />
        </View>
      )}
    </Card>
  );
}

function GutCheckToggle({
  label,
  value,
  disabled,
  onValueChange,
}: {
  label: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <Text
        style={{
          color: disabled ? c.mutedForeground : c.foreground,
          fontSize: 13,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ true: c.primary, false: c.muted }}
      />
    </View>
  );
}
