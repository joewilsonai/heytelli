import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { fetch as expoFetch } from "expo/fetch";
import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import {
  deleteChatConversation,
  getGetChatConversationQueryKey,
  getListChatConversationsQueryKey,
  useGetChatConversation,
} from "@workspace/api-client-react";
import type { ChatMessage } from "@workspace/api-client-react";

import { Body, EmptyState, IconButton } from "@/components/ui";

const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN;

type Bubble = {
  key: string;
  role: "user" | "assistant" | "system";
  content: string;
  pending?: boolean;
};

export default function ChatScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const convId = Number(id);
  const { data, refetch, isLoading } = useGetChatConversation(convId);

  const [input, setInput] = useState("");
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [streaming, setStreaming] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Server stores the conversation history. Each turn we POST only the new
  // user message — never the whole history — and the server replays the
  // stored history to the LLM.
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    setOptimistic(text);
    setStreaming("");
    setIsStreaming(true);
    Haptics.selectionAsync().catch(() => {});

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await expoFetch(
        `https://${DOMAIN}/api/chat/conversations/${convId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          body: JSON.stringify({ content: text }),
          signal: controller.signal,
        },
      );
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const ev of events) {
          const line = ev.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (typeof payload.content === "string") {
              acc += payload.content;
              setStreaming(acc);
            }
            if (payload.error) throw new Error(payload.error);
          } catch {
            // ignore non-JSON keepalives
          }
        }
      }
      Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        Alert.alert("Chat error", e?.message ?? "Stream failed.");
      }
    } finally {
      setIsStreaming(false);
      setOptimistic(null);
      setStreaming("");
      abortRef.current = null;
      await refetch();
      qc.invalidateQueries({
        queryKey: getGetChatConversationQueryKey(convId),
      });
    }
  }, [convId, input, isStreaming, qc, refetch]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleDelete = () => {
    Alert.alert("Delete chat?", "This conversation will be removed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteChatConversation(convId);
            qc.invalidateQueries({
              queryKey: getListChatConversationsQueryKey(),
            });
            router.back();
          } catch (e: any) {
            Alert.alert("Couldn't delete", e?.message ?? "Try again.");
          }
        },
      },
    ]);
  };

  const bubbles = useMemo<Bubble[]>(() => {
    const msgs = (data?.messages ?? []) as ChatMessage[];
    const out: Bubble[] = msgs.map((m) => ({
      key: `m-${m.id}`,
      role: m.role as Bubble["role"],
      content: m.content,
    }));
    if (optimistic) {
      out.push({ key: "opt-user", role: "user", content: optimistic });
    }
    if (isStreaming) {
      out.push({
        key: "opt-assistant",
        role: "assistant",
        content: streaming,
        pending: true,
      });
    }
    return out;
  }, [data, optimistic, isStreaming, streaming]);

  // Inverted FlatList: render newest-first
  const reversed = useMemo(() => [...bubbles].reverse(), [bubbles]);

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={{ flex: 1, backgroundColor: c.background }}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 44 : 0}
    >
      <Stack.Screen
        options={{
          title: data?.title ?? "Chat",
          headerRight: () => (
            <IconButton
              icon="trash-2"
              onPress={handleDelete}
              color={c.mutedForeground}
              size={18}
              hint="Delete chat"
            />
          ),
        }}
      />

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : bubbles.length === 0 ? (
        <EmptyState
          icon="message-circle"
          title="Ask anything"
          hint="What to say next, how to read her vibe, when to escalate."
        />
      ) : (
        <FlatList
          data={reversed}
          inverted
          keyExtractor={(b) => b.key}
          renderItem={({ item }) => <MessageBubble bubble={item} />}
          contentContainerStyle={{
            padding: 16,
            paddingTop: 16,
            gap: 8,
          }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        />
      )}

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: c.border,
          padding: 10,
          paddingBottom: Math.max(insets.bottom, 10),
          backgroundColor: c.card,
          flexDirection: "row",
          gap: 8,
          alignItems: "flex-end",
        }}
      >
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Ask HeyTelli..."
          placeholderTextColor={c.mutedForeground}
          multiline
          editable={!isStreaming}
          style={{
            flex: 1,
            maxHeight: 120,
            minHeight: 40,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 20,
            paddingHorizontal: 14,
            paddingTop: 10,
            paddingBottom: 10,
            fontSize: 14,
            color: c.foreground,
            backgroundColor: c.background,
          }}
        />
        <Pressable
          onPress={send}
          disabled={isStreaming || !input.trim()}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor:
              isStreaming || !input.trim() ? c.muted : c.primary,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.7 : 1,
          })}
          accessibilityLabel="Send"
        >
          {isStreaming ? (
            <ActivityIndicator size="small" color={c.mutedForeground} />
          ) : (
            <Feather
              name="arrow-up"
              size={18}
              color={input.trim() ? c.primaryForeground : c.mutedForeground}
            />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function MessageBubble({ bubble }: { bubble: Bubble }) {
  const c = useColors();
  const isUser = bubble.role === "user";
  return (
    <View
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "85%",
        backgroundColor: isUser ? c.primary : c.card,
        borderWidth: isUser ? 0 : 1,
        borderColor: c.border,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 18,
        borderBottomRightRadius: isUser ? 4 : 18,
        borderBottomLeftRadius: isUser ? 18 : 4,
      }}
    >
      <Text
        style={{
          fontSize: 14,
          lineHeight: 20,
          color: isUser ? c.primaryForeground : c.foreground,
        }}
      >
        {bubble.content || (bubble.pending ? "…" : "")}
      </Text>
    </View>
  );
}
