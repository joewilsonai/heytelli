import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import {
  applyTagSuggestions,
  getGetTagHistoryQueryKey,
  getTagSuggestions,
  updateMatch,
} from "@workspace/api-client-react";
import type { TagSuggestion } from "@workspace/api-client-react";

import { Body, Card, SectionLabel } from "./ui";

export function TagsRow({
  matchId,
  tags,
  onChange,
}: {
  matchId: number;
  tags: string[];
  onChange: () => void;
}) {
  const c = useColors();
  const qc = useQueryClient();
  const invalidateHistory = () =>
    qc.invalidateQueries({ queryKey: getGetTagHistoryQueryKey(matchId) });
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [suggestions, setSuggestions] = useState<TagSuggestion[] | null>(null);
  const [summary, setSummary] = useState<string>("");
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  const save = async (next: string[]) => {
    setSaving(true);
    try {
      await updateMatch(matchId, { tags: next });
      invalidateHistory();
      onChange();
    } catch (e: any) {
      Alert.alert("Couldn't update tags", e?.message ?? "Try again.");
    } finally {
      setSaving(false);
    }
  };

  const add = () => {
    const t = draft.trim().toLowerCase();
    if (!t || tags.includes(t)) {
      setAdding(false);
      setDraft("");
      return;
    }
    save([...tags, t]);
    setAdding(false);
    setDraft("");
  };

  const remove = (t: string) => {
    Haptics.selectionAsync().catch(() => {});
    save(tags.filter((x) => x !== t));
  };

  const suggest = async () => {
    setSuggesting(true);
    try {
      const r = await getTagSuggestions(matchId);
      setSuggestions(r.suggestions);
      setSummary(r.summary);
      const init: Record<string, boolean> = {};
      r.suggestions.forEach((s) => {
        init[`${s.action}:${s.tag}`] = true;
      });
      setPicked(init);
    } catch (e: any) {
      Alert.alert("Couldn't suggest tags", e?.message ?? "Try again.");
    } finally {
      setSuggesting(false);
    }
  };

  const apply = async () => {
    if (!suggestions) return;
    const chosen = suggestions.filter((s) => picked[`${s.action}:${s.tag}`]);
    if (chosen.length === 0) {
      setSuggestions(null);
      return;
    }
    setApplying(true);
    try {
      await applyTagSuggestions(matchId, { suggestions: chosen });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSuggestions(null);
      setSummary("");
      setPicked({});
      invalidateHistory();
      onChange();
    } catch (e: any) {
      Alert.alert("Couldn't apply", e?.message ?? "Try again.");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <SectionLabel>Tags</SectionLabel>
        <Pressable onPress={suggest} disabled={suggesting || applying} hitSlop={8}>
          {suggesting ? (
            <ActivityIndicator size="small" color={c.primary} />
          ) : (
            <Feather name="zap" size={16} color={c.primary} />
          )}
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
        {tags.map((t) => (
          <Pressable
            key={t}
            onLongPress={() => remove(t)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 999,
              backgroundColor: c.primary,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Text style={{ color: c.primaryForeground, fontSize: 12, fontWeight: "500" }}>
              {t}
            </Text>
            <Pressable onPress={() => remove(t)} hitSlop={6}>
              <Feather name="x" size={12} color={c.primaryForeground} />
            </Pressable>
          </Pressable>
        ))}
        {adding ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              borderRadius: 999,
              borderWidth: 1,
              borderColor: c.border,
              paddingHorizontal: 8,
              paddingVertical: 2,
            }}
          >
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="tag"
              placeholderTextColor={c.mutedForeground}
              autoFocus
              onSubmitEditing={add}
              onBlur={add}
              editable={!saving}
              style={{
                color: c.foreground,
                fontSize: 12,
                paddingVertical: 2,
                minWidth: 50,
              }}
            />
          </View>
        ) : (
          <Pressable
            onPress={() => setAdding(true)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: c.border,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Feather name="plus" size={12} color={c.mutedForeground} />
            <Text style={{ color: c.mutedForeground, fontSize: 12 }}>Add tag</Text>
          </Pressable>
        )}
      </View>

      {suggestions && suggestions.length === 0 && (
        <Body muted style={{ fontSize: 12, marginTop: 8 }}>
          {summary || "Tags look up to date."}
        </Body>
      )}

      {suggestions && suggestions.length > 0 && (
        <View
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 10,
            backgroundColor: c.muted,
            borderWidth: 1,
            borderColor: c.border,
            gap: 8,
          }}
        >
          {summary ? (
            <Text style={{ color: c.mutedForeground, fontSize: 11 }}>{summary}</Text>
          ) : null}
          {suggestions.map((s) => {
            const key = `${s.action}:${s.tag}`;
            const on = !!picked[key];
            const tint = s.action === "add" ? "#10B981" : "#EF4444";
            return (
              <Pressable
                key={key}
                onPress={() => setPicked((p) => ({ ...p, [key]: !on }))}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Feather
                  name={on ? "check-square" : "square"}
                  size={16}
                  color={on ? c.primary : c.mutedForeground}
                />
                <Feather name={s.action === "add" ? "plus" : "minus"} size={12} color={tint} />
                <Text
                  style={{
                    color: c.foreground,
                    fontSize: 13,
                    fontWeight: "500",
                  }}
                >
                  {s.tag}
                </Text>
                <Text
                  style={{ color: c.mutedForeground, fontSize: 11, flex: 1 }}
                  numberOfLines={1}
                >
                  {s.reason}
                </Text>
              </Pressable>
            );
          })}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
            <Pressable
              onPress={apply}
              disabled={applying}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 8,
                borderRadius: 8,
                backgroundColor: c.primary,
                alignItems: "center",
                opacity: pressed || applying ? 0.7 : 1,
              })}
            >
              {applying ? (
                <ActivityIndicator size="small" color={c.primaryForeground} />
              ) : (
                <Text
                  style={{
                    color: c.primaryForeground,
                    fontSize: 12,
                    fontWeight: "600",
                  }}
                >
                  Apply selected
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => {
                setSuggestions(null);
                setPicked({});
                setSummary("");
              }}
              style={({ pressed }) => ({
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: c.border,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ color: c.mutedForeground, fontSize: 12 }}>Dismiss</Text>
            </Pressable>
          </View>
        </View>
      )}

      <Text style={{ color: c.mutedForeground, fontSize: 10, marginTop: 6 }}>
        Long-press a tag to remove. Tap ⚡ for AI suggestions from chat context.
      </Text>
    </Card>
  );
}
