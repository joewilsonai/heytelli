import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Body, Button, SectionLabel } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import {
  feedbackTypes,
  submitImprovementFeedback,
  type FeedbackType,
} from "@/lib/improvement-feedback";

export function FeedbackSheet({
  visible,
  surface,
  matchId,
  onClose,
  onSubmitted,
}: {
  visible: boolean;
  surface: string;
  matchId?: number | null;
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<FeedbackType>("Bug");
  const [message, setMessage] = useState("");
  const [includeContext, setIncludeContext] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setType("Bug");
    setMessage("");
    setIncludeContext(true);
  }, [visible]);

  const send = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    try {
      await submitImprovementFeedback({
        type,
        message,
        surface,
        matchId,
        technicalContextConsent: includeContext,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      onSubmitted?.();
      onClose();
      Alert.alert("Thanks", "Telli will use this to improve HeyTelli.");
    } catch (error: any) {
      Alert.alert("Couldn't save feedback", error?.message ?? "Try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "flex-end" }}
      >
        <Pressable
          accessibilityLabel="Close feedback"
          onPress={onClose}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.28)" }}
        />
        <View
          style={{
            backgroundColor: c.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: insets.bottom + 20,
            gap: 14,
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
            <View style={{ flex: 1 }}>
              <SectionLabel>Beta feedback</SectionLabel>
              <Text
                style={{
                  color: c.foreground,
                  fontSize: 20,
                  fontWeight: "700",
                }}
              >
                Help shape HeyTelli
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close feedback"
              onPress={onClose}
              hitSlop={10}
            >
              <Feather name="x" size={22} color={c.foreground} />
            </Pressable>
          </View>

          <Body muted>
            Send a quick note. We do not include screenshots or private conversations in engineering issues.
          </Body>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {feedbackTypes.map((option) => {
              const selected = option === type;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setType(option)}
                  style={({ pressed }) => ({
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: selected ? c.primary : c.border,
                    backgroundColor: selected ? c.accent : c.background,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <Text
                    style={{
                      color: selected ? c.accentForeground : c.foreground,
                      fontSize: 13,
                      fontWeight: "600",
                    }}
                  >
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            placeholder="What felt wrong, missing, or surprisingly helpful?"
            placeholderTextColor={c.mutedForeground}
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={1200}
            style={{
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: 14,
              minHeight: 116,
              paddingHorizontal: 14,
              paddingVertical: 12,
              color: c.foreground,
              backgroundColor: c.background,
              textAlignVertical: "top",
              fontSize: 15,
            }}
          />

          <View
            style={{
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: 14,
              padding: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
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
                Include basic app context
              </Text>
              <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
                Route, app version, and build number only.
              </Text>
            </View>
            <Switch value={includeContext} onValueChange={setIncludeContext} />
          </View>

          <Button
            label="Send feedback"
            icon="send"
            loading={sending}
            disabled={!message.trim() || sending}
            onPress={send}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
