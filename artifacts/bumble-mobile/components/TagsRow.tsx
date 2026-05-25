import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { updateMatch } from "@workspace/api-client-react";

import { Card, SectionLabel } from "./ui";

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
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (next: string[]) => {
    setSaving(true);
    try {
      await updateMatch(matchId, { tags: next });
      onChange();
    } catch (e: any) {
      Alert.alert("Couldn't update tags", e?.message ?? "Try again.");
    } finally {
      setSaving(false);
    }
  };

  const add = () => {
    const t = draft.trim().toLowerCase();
    if (!t) {
      setAdding(false);
      setDraft("");
      return;
    }
    if (tags.includes(t)) {
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

  return (
    <Card>
      <SectionLabel>Tags</SectionLabel>
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
            <Text style={{ color: c.primaryForeground, fontSize: 12, fontFamily: "Inter_500Medium" }}>
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
      <Text style={{ color: c.mutedForeground, fontSize: 10, marginTop: 6 }}>
        Long-press a tag to remove. Tags filter your list on the home screen.
      </Text>
    </Card>
  );
}
