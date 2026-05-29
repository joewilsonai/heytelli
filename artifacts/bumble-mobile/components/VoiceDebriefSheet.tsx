import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import {
  voiceDebrief,
  type VoiceDebriefAnalysis,
} from "@workspace/api-client-react";

import { Body, IconButton, VibeTag } from "@/components/ui";
import {
  cancelRecording,
  startRecording,
  stopRecording,
  uploadAudio,
} from "@/lib/recorder";
import { formatDateTime } from "@/lib/format";

type Phase = "idle" | "recording" | "processing" | "result";

export function VoiceDebriefSheet({
  visible,
  matchId,
  matchName,
  onClose,
  onApplied,
}: {
  visible: boolean;
  matchId: number;
  matchName: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [analysis, setAnalysis] = useState<VoiceDebriefAnalysis | null>(null);
  const [transcript, setTranscript] = useState<string>("");
  const [addToDateHistory, setAddToDateHistory] = useState(false);
  const startRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible) {
      // clean up on close
      if (phase === "recording") {
        cancelRecording().catch(() => {});
      }
      if (timerRef.current) clearInterval(timerRef.current);
      setPhase("idle");
      setElapsed(0);
      setAnalysis(null);
      setTranscript("");
      setAddToDateHistory(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const begin = async () => {
    try {
      await startRecording();
      startRef.current = Date.now();
      setElapsed(0);
      setPhase("recording");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }, 250);
    } catch (e: any) {
      Alert.alert("Couldn't start recording", e?.message ?? "Try again.");
    }
  };

  const finish = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase("processing");
    try {
      const { uri } = await stopRecording();
      const audioObjectPath = await uploadAudio(uri);
      const result = await voiceDebrief(matchId, {
        audioObjectPath,
        addToDateHistory,
      });
      setAnalysis(result.analysis);
      setTranscript(result.transcript);
      setPhase("result");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      onApplied();
    } catch (e: any) {
      Alert.alert("Debrief failed", e?.message ?? "Try again.");
      setPhase("idle");
    }
  };

  const cancel = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    await cancelRecording().catch(() => {});
    setPhase("idle");
    setElapsed(0);
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: c.background, paddingTop: 16 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 20,
            paddingBottom: 12,
          }}
        >
          <View>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                color: c.foreground,
              }}
            >
              Voice debrief
            </Text>
            <Text
              style={{ fontSize: 12, color: c.mutedForeground, marginTop: 2 }}
            >
              {matchName}
            </Text>
          </View>
          <IconButton icon="x" onPress={onClose} hint="Close" />
        </View>

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: insets.bottom + 24,
            gap: 16,
          }}
        >
          {phase === "idle" && (
            <>
              <Body muted>
                Hit record and talk freely about what happened — the date, what
                they said, how it felt. HeyTelli will save the transcript,
                update the read, flag concerns, and add useful tags.
              </Body>
              <RecordButton onPress={begin} />
              <DateHistoryToggle
                value={addToDateHistory}
                onChange={setAddToDateHistory}
              />
            </>
          )}

          {phase === "recording" && (
            <View style={{ gap: 16, alignItems: "center" }}>
              <View
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: 60,
                  backgroundColor: c.destructive,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="mic" size={48} color="#fff" />
              </View>
              <Text
                style={{
                  fontSize: 32,
                  fontWeight: "700",
                  color: c.foreground,
                  letterSpacing: 0,
                }}
              >
                {mm}:{ss}
              </Text>
              <Text style={{ color: c.mutedForeground }}>Recording…</Text>
              <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
                <Pressable
                  onPress={cancel}
                  style={({ pressed }) => ({
                    paddingHorizontal: 20,
                    paddingVertical: 12,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: c.border,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ color: c.foreground, fontWeight: "600" }}>
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={finish}
                  style={({ pressed }) => ({
                    paddingHorizontal: 24,
                    paddingVertical: 12,
                    borderRadius: 999,
                    backgroundColor: c.primary,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Feather name="check" size={16} color={c.primaryForeground} />
                  <Text
                    style={{
                      color: c.primaryForeground,
                      fontWeight: "600",
                    }}
                  >
                    Done
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {phase === "processing" && (
            <View
              style={{ alignItems: "center", paddingVertical: 60, gap: 16 }}
            >
              <ActivityIndicator size="large" color={c.primary} />
              <Text style={{ color: c.mutedForeground }}>
                Transcribing and analyzing…
              </Text>
            </View>
          )}

          {phase === "result" && analysis && (
            <>
              <Section title="Summary">
                <Body>{analysis.summary}</Body>
              </Section>
              {analysis.vibe && (
                <Section title="Vibe">
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
                  >
                    <VibeTag label={analysis.vibe} />
                  </View>
                </Section>
              )}
              {analysis.greenFlags.length > 0 && (
                <Section title="Green flags">
                  {analysis.greenFlags.map((f, i) => (
                    <BulletRow
                      key={i}
                      text={f}
                      color={c.success}
                      icon="check"
                    />
                  ))}
                </Section>
              )}
              {analysis.redFlags.length > 0 && (
                <Section title="Red flags">
                  {analysis.redFlags.map((f, i) => (
                    <BulletRow
                      key={i}
                      text={f}
                      color={c.destructive}
                      icon="alert-triangle"
                    />
                  ))}
                </Section>
              )}
              {analysis.nextMoveSuggestion && (
                <Section title="Next move">
                  <Body>{analysis.nextMoveSuggestion}</Body>
                </Section>
              )}
              {analysis.tagsToAdd.length > 0 && (
                <Section title="Tags saved">
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
                  >
                    {analysis.tagsToAdd.map((t) => (
                      <VibeTag key={t.tag} label={t.tag} />
                    ))}
                  </View>
                </Section>
              )}
              {analysis.date.isDate && (
                <Section title="Date timeline">
                  <Body>
                    {analysis.date.recap ??
                      "This debrief was saved as a date entry."}
                  </Body>
                  {(analysis.date.when || analysis.date.location) && (
                    <Body muted>
                      {[
                        analysis.date.when
                          ? formatDateTime(analysis.date.when)
                          : null,
                        analysis.date.location,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Body>
                  )}
                </Section>
              )}
              {analysis.readUpdate && (
                <Section title="Latest read">
                  <Body>{analysis.readUpdate}</Body>
                </Section>
              )}
              <Section title="Saved">
                <Body muted>
                  Transcript, signals, tags, and read updates are now on this
                  match timeline.
                </Body>
              </Section>
              <Section title="Transcript">
                <Body muted>{transcript}</Body>
              </Section>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => ({
                  marginTop: 8,
                  paddingVertical: 14,
                  borderRadius: 14,
                  backgroundColor: c.primary,
                  alignItems: "center",
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text
                  style={{
                    color: c.primaryForeground,
                    fontWeight: "600",
                  }}
                >
                  Done
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function RecordButton({ onPress }: { onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        alignSelf: "center",
        marginTop: 8,
        width: 96,
        height: 96,
        borderRadius: 48,
        backgroundColor: c.destructive,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: c.destructive,
        shadowOpacity: 0.4,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
        opacity: pressed ? 0.85 : 1,
      })}
      accessibilityLabel="Start recording"
    >
      <Feather name="mic" size={36} color="#fff" />
    </Pressable>
  );
}

function DateHistoryToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 14,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 12,
        backgroundColor: c.card,
      }}
    >
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ fontWeight: "600", color: c.foreground, fontSize: 14 }}>
          Log this as a date
        </Text>
        <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 2 }}>
          Adds an entry to this connection's date history and clears the
          upcoming-date slot.
        </Text>
      </View>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const c = useColors();
  return (
    <View
      style={{
        backgroundColor: c.card,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 14,
        padding: 14,
        gap: 8,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: "600",
          color: c.mutedForeground,
          letterSpacing: 0,
          textTransform: "uppercase",
        }}
      >
        {title}
      </Text>
      <View style={{ gap: 6 }}>{children}</View>
    </View>
  );
}

function BulletRow({
  text,
  color,
  icon,
}: {
  text: string;
  color: string;
  icon: keyof typeof Feather.glyphMap;
}) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
      <Feather name={icon} size={14} color={color} style={{ marginTop: 3 }} />
      <Text
        style={{ flex: 1, color: c.foreground, fontSize: 14, lineHeight: 20 }}
      >
        {text}
      </Text>
    </View>
  );
}
