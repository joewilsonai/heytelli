import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { voiceNoteFeedback } from "@workspace/api-client-react";

import { Body, IconButton } from "@/components/ui";
import {
  cancelRecording,
  startRecording,
  stopRecording,
  uploadAudio,
} from "@/lib/recorder";

type Phase = "idle" | "recording" | "processing" | "result";

type Result = Awaited<ReturnType<typeof voiceNoteFeedback>>;

export function VoiceNoteFeedbackSheet({
  visible,
  matchId,
  matchName,
  onClose,
}: {
  visible: boolean;
  matchId: number;
  matchName: string;
  onClose: () => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const startRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible) {
      if (phase === "recording") cancelRecording().catch(() => {});
      if (timerRef.current) clearInterval(timerRef.current);
      setPhase("idle");
      setElapsed(0);
      setResult(null);
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
      const res = await voiceNoteFeedback(matchId, { audioObjectPath });
      setResult(res);
      setPhase("result");
    } catch (e: any) {
      Alert.alert("Couldn't analyze", e?.message ?? "Try again.");
      setPhase("idle");
    }
  };

  const cancel = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    await cancelRecording().catch(() => {});
    setPhase("idle");
    setElapsed(0);
  };

  const verdictColor = (v: Result["shouldSend"] | undefined) =>
    v === "send" ? c.success : v === "scrap" ? c.destructive : c.warning;

  const verdictLabel = (v: Result["shouldSend"] | undefined) =>
    v === "send" ? "Send it" : v === "scrap" ? "Scrap it" : "Revise first";

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
              style={{ fontSize: 18, fontWeight: "700", color: c.foreground }}
            >
              Voice note check
            </Text>
            <Text
              style={{ fontSize: 12, color: c.mutedForeground, marginTop: 2 }}
            >
              Critique before you send to {matchName}
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
                Record the voice note you'd send. Get tone, energy, and concrete
                fixes before you press send.
              </Body>
              <Pressable
                onPress={begin}
                style={({ pressed }) => ({
                  alignSelf: "center",
                  marginTop: 8,
                  width: 96,
                  height: 96,
                  borderRadius: 48,
                  backgroundColor: c.destructive,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Feather name="mic" size={36} color="#fff" />
              </Pressable>
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
                style={{ fontSize: 32, fontWeight: "700", color: c.foreground }}
              >
                {mm}:{ss}
              </Text>
              <View style={{ flexDirection: "row", gap: 12 }}>
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
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Text
                    style={{ color: c.primaryForeground, fontWeight: "600" }}
                  >
                    Critique
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
                Analyzing your delivery…
              </Text>
            </View>
          )}

          {phase === "result" && result && (
            <>
              <View
                style={{
                  padding: 16,
                  borderRadius: 14,
                  backgroundColor: verdictColor(result.shouldSend) + "22",
                  borderWidth: 1,
                  borderColor: verdictColor(result.shouldSend),
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: "700",
                    color: verdictColor(result.shouldSend),
                  }}
                >
                  {verdictLabel(result.shouldSend)}
                </Text>
                <View style={{ flexDirection: "row", gap: 24, marginTop: 12 }}>
                  <Metric label="Tone" value={result.toneRating} />
                  <Metric label="Energy" value={result.energyRating} />
                </View>
              </View>

              {result.strengths.length > 0 && (
                <Section title="What works">
                  {result.strengths.map((s, i) => (
                    <Bullet key={i} text={s} color={c.success} icon="check" />
                  ))}
                </Section>
              )}
              {result.improvements.length > 0 && (
                <Section title="Fix this">
                  {result.improvements.map((s, i) => (
                    <Bullet
                      key={i}
                      text={s}
                      color={c.warning}
                      icon="alert-circle"
                    />
                  ))}
                </Section>
              )}
              {result.rewrite && (
                <Section title="Suggested rewrite">
                  <Body>{result.rewrite}</Body>
                  <Pressable
                    onPress={() => {
                      Clipboard.setStringAsync(result.rewrite ?? "").catch(
                        () => {},
                      );
                      Haptics.notificationAsync(
                        Haptics.NotificationFeedbackType.Success,
                      ).catch(() => {});
                    }}
                    style={({ pressed }) => ({
                      marginTop: 8,
                      alignSelf: "flex-start",
                      flexDirection: "row",
                      gap: 6,
                      alignItems: "center",
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: c.border,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Feather name="copy" size={12} color={c.foreground} />
                    <Text style={{ fontSize: 12, color: c.foreground }}>
                      Copy
                    </Text>
                  </Pressable>
                </Section>
              )}
              <Section title="What you said">
                <Body muted>{result.transcript}</Body>
              </Section>
              <Pressable
                onPress={() => setPhase("idle")}
                style={({ pressed }) => ({
                  marginTop: 8,
                  paddingVertical: 14,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: c.border,
                  alignItems: "center",
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ color: c.foreground, fontWeight: "600" }}>
                  Try another take
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function Metric({ label, value }: { label: string; value: number | null }) {
  const c = useColors();
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={{ fontSize: 28, fontWeight: "700", color: c.foreground }}>
        {value ?? "—"}
      </Text>
      <Text
        style={{
          fontSize: 11,
          color: c.mutedForeground,
          letterSpacing: 0,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
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

function Bullet({
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
