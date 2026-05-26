import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import {
  createChatConversation,
  getListChatConversationsQueryKey,
  useListMatches,
  useListChatConversations,
} from "@workspace/api-client-react";
import type {
  Match,
  ChatConversation,
} from "@workspace/api-client-react";

import {
  Body,
  Button,
  EmptyState,
  H1,
  IconButton,
  Skeleton,
} from "@/components/ui";
import { formatTimeAgo } from "@/lib/format";

export default function ChatListScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading, refetch, isRefetching } =
    useListChatConversations();
  const { data: matches = [] } = useListMatches();
  const [composerOpen, setComposerOpen] = useState(false);

  const convs = (data ?? []) as ChatConversation[];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View
        style={{
          paddingTop: insets.top + (Platform.OS === "web" ? 60 : 8),
          paddingHorizontal: 20,
          paddingBottom: 8,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <IconButton
            icon="chevron-left"
            onPress={() => router.back()}
            hint="Back"
          />
          <View>
            <H1>HeyTelli chat</H1>
            <Body muted style={{ marginTop: 2, fontSize: 12 }}>
              Talk through any match privately
            </Body>
          </View>
        </View>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setComposerOpen(true);
          }}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: c.primary,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.7 : 1,
          })}
          accessibilityLabel="New chat"
        >
          <Feather name="edit" size={20} color={c.primaryForeground} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={{ padding: 20, gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={64} />
          ))}
        </View>
      ) : (
        <FlatList
          data={convs}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 24,
            gap: 8,
          }}
          refreshing={isRefetching}
          onRefresh={refetch}
          renderItem={({ item }) => (
            <ConversationRow
              conv={item}
              matchName={
                item.matchId == null
                  ? null
                  : matches.find((m) => m.id === item.matchId)?.name ?? null
              }
              onPress={() => router.push(`/chat/${item.id}`)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="message-circle"
              title="No chats yet"
              hint="Tap the pencil to start a conversation about a match."
              action={{
                label: "Start a chat",
                onPress: () => setComposerOpen(true),
              }}
            />
          }
        />
      )}

      <NewChatModal
        visible={composerOpen}
        onClose={() => setComposerOpen(false)}
        matches={matches}
        onCreated={(id) => {
          setComposerOpen(false);
          qc.invalidateQueries({
            queryKey: getListChatConversationsQueryKey(),
          });
          router.push(`/chat/${id}`);
        }}
      />
    </View>
  );
}

function ConversationRow({
  conv,
  matchName,
  onPress,
}: {
  conv: ChatConversation;
  matchName: string | null;
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
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: c.accent,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather name="message-circle" size={18} color={c.accentForeground} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 15,
            fontWeight: "600",
            color: c.foreground,
          }}
          numberOfLines={1}
        >
          {conv.title}
        </Text>
        <Text style={{ fontSize: 12, color: c.mutedForeground, marginTop: 2 }}>
          {matchName ?? "All matches"} · {formatTimeAgo(conv.createdAt)}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={c.mutedForeground} />
    </Pressable>
  );
}

function NewChatModal({
  visible,
  onClose,
  matches,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  matches: Match[];
  onCreated: (id: number) => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [matchId, setMatchId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const finalTitle =
      title.trim() ||
      (matchId == null
        ? "All matches chat"
        : `Chat about ${matches.find((m) => m.id === matchId)?.name ?? "match"}`);
    setBusy(true);
    try {
      const created = await createChatConversation({
        title: finalTitle,
        matchId,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      setTitle("");
      setMatchId(null);
      onCreated(created.id);
    } catch (e: any) {
      Alert.alert("Couldn't create chat", e?.message ?? "Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: c.background,
          paddingTop: 16,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 20,
            paddingBottom: 16,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: "700",
              color: c.foreground,
            }}
          >
            New chat
          </Text>
          <IconButton icon="x" onPress={onClose} hint="Close" />
        </View>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, gap: 16, paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <View>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: c.mutedForeground,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Who about?
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              <ChoiceChip
                label="All matches"
                active={matchId == null}
                onPress={() => setMatchId(null)}
              />
              {matches.map((m) => (
                <ChoiceChip
                  key={m.id}
                  label={m.name}
                  active={matchId === m.id}
                  onPress={() => setMatchId(m.id)}
                />
              ))}
            </View>
          </View>
          <View>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: c.mutedForeground,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Title (optional)
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Auto-generated if blank"
              placeholderTextColor={c.mutedForeground}
              style={{
                borderWidth: 1,
                borderColor: c.border,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 14,
                color: c.foreground,
                backgroundColor: c.card,
              }}
            />
          </View>
          <Button
            label="Start chat"
            icon="message-circle"
            onPress={submit}
            loading={busy}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}

function ChoiceChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
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
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? c.foreground : c.border,
        backgroundColor: active ? c.foreground : c.card,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: "500",
          color: active ? c.background : c.foreground,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
