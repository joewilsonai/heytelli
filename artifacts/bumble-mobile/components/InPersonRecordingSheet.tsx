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
import { inPersonRecording, type VoiceDebriefAnalysis } from "@workspace/api-client-react";

import { Body, IconButton, VibeTag } from "@/components/ui";
import {
  cancelRecording,
  startRecording,
  stopRecording,
  uploadAudio,
} from "@/lib/recorder";
import { formatDateTime } from "@/lib/format";

type Phase = "consent" | "ready" | "recording" | "processing" | "result";

export function InPersonRecordingSheet({
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
  const [phase, setPhase] = useState<Phase>("consent");
  const [iConsent, setIConsent] = useState(false);
  const [sheConsents, setSheConsents] = useState(false);
  const [legalAck, setLegalAck] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [analysis, setAnalysis] = useState<VoiceDebriefAnalysis | null>(null);
  const [transcript, setTranscript] = useState("");
  const [addToHistory, setAddToHistory] = useState(false);
  const startRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible) {
      if (phase === "recording") cancelRecording().catch(() => {});
      if (timerRef.current) clearInterval(timerRef.current);
      setPhase("consent");
      setIConsent(false);
      setSheConsents(false);
      setLegalAck(false);
      setElapsed(0);
      setAnalysis(null);
      setTranscript("");
      setAddToHistory(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const proceed = () => {
    if (!iConsent || !sheConsents || !legalAck) return;
    setPhase("ready");
  };

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
      const res = await inPersonRecording(matchId, {
        audioObjectPath,
        bothPartiesConsented: true,
        addToDateHistory: addToHistory,
      });
      setAnalysis(res.analysis);
      setTranscript(res.transcript);
      setPhase("result");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onApplied();
    } catch (e: any) {
      Alert.alert("Analysis failed", e?.message ?? "Try again.");
      setPhase("ready");
    }
  };

  const cancel = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    await cancelRecording().catch(() => {});
    setPhase("ready");
    setElapsed(0);
  };

  const hh = String(Math.floor(elapsed / 3600)).padStart(2, "0");
  const mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
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
            <Text style={{ fontSize: 18, fontWeight: "700", color: c.foreground }}>
              In-person recording
            </Text>
            <Text style={{ fontSize: 12, color: c.mutedForeground, marginTop: 2 }}>
              Date with {matchName}
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
          {phase === "consent" && (
            <>
              <View
                style={{
                  padding: 14,
                  borderRadius: 12,
                  backgroundColor: c.destructive + "11",
                  borderWidth: 1,
                  borderColor: c.destructive,
                  flexDirection: "row",
                  gap: 10,
                }}
              >
                <Feather name="alert-triangle" size={20} color={c.destructive} style={{ marginTop: 2 }} />
                <Text style={{ flex: 1, color: c.foreground, fontSize: 13, lineHeight: 19 }}>
                  Recording someone without consent is illegal in many places
                  ("two-party consent" states/countries). You must verbally ask
                  her and get clear, recorded "yes" before pressing record.
                </Text>
              </View>

              <ConsentToggle
                label={`I have her explicit verbal consent to record`}
                value={sheConsents}
                onChange={setSheConsents}
              />
              <ConsentToggle
                label="I am OK being recorded too"
                value={iConsent}
                onChange={setIConsent}
              />
              <ConsentToggle
                label="I take legal responsibility for this recording in my jurisdiction"
                value={legalAck}
                onChange={setLegalAck}
              />

              <Pressable
                disabled={!iConsent || !sheConsents || !legalAck}
                onPress={proceed}
                style={({ pressed }) => ({
                  marginTop: 8,
                  paddingVertical: 14,
                  borderRadius: 14,
                  backgroundColor:
                    iConsent && sheConsents && legalAck ? c.primary : c.muted,
                  alignItems: "center",
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text
                  style={{
                    color:
                      iConsent && sheConsents && legalAck
                        ? c.primaryForeground
                        : c.mutedForeground,
                    fontWeight: "600",
                  }}
                >
                  Continue
                </Text>
              </Pressable>
            </>
          )}

          {phase === "ready" && (
            <>
              <Body muted>
                Place the phone where it can hear both of you. The recording
                stays on your device until you stop — then it's transcribed and
                analyzed.
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
              <DateHistoryToggle value={addToHistory} onChange={setAddToHistory} />
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
              <Text style={{ fontSize: 28, fontWeight: "700", color: c.foreground }}>
                {hh !== "00" ? `${hh}:` : ""}
                {mm}:{ss}
              </Text>
              <Text style={{ color: c.mutedForeground }}>Recording…</Text>
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
                    Discard
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
                  <Text style={{ color: c.primaryForeground, fontWeight: "600" }}>
                    Stop & analyze
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {phase === "processing" && (
            <View style={{ alignItems: "center", paddingVertical: 60, gap: 16 }}>
              <ActivityIndicator size="large" color={c.primary} />
              <Text style={{ color: c.mutedForeground }}>
                Uploading, transcribing, analyzing… (can take a minute)
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
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    <VibeTag label={analysis.vibe} />
                  </View>
                </Section>
              )}
              {analysis.greenFlags.length > 0 && (
                <Section title="Green flags">
                  {analysis.greenFlags.map((f, i) => (
                    <Bullet key={i} text={f} color={c.success} icon="check" />
                  ))}
                </Section>
              )}
              {analysis.redFlags.length > 0 && (
                <Section title="Red flags">
                  {analysis.redFlags.map((f, i) => (
                    <Bullet key={i} text={f} color={c.destructive} icon="alert-triangle" />
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
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
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
                      "This recording was saved as a date entry."}
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
                <Text style={{ color: c.primaryForeground, fontWeight: "600" }}>
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

function ConsentToggle({
  label,
  value,
  onChange,
}: {
  label: string;
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
        borderColor: value ? c.primary : c.border,
        borderRadius: 12,
        backgroundColor: c.card,
        gap: 12,
      }}
    >
      <Text style={{ flex: 1, color: c.foreground, fontSize: 13, lineHeight: 18 }}>
        {label}
      </Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
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
          Adds an entry to her date history.
        </Text>
      </View>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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
          letterSpacing: 1.2,
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
      <Text style={{ flex: 1, color: c.foreground, fontSize: 14, lineHeight: 20 }}>
        {text}
      </Text>
    </View>
  );
}
