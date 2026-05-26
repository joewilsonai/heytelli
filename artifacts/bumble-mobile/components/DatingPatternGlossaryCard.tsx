import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Body, Card, SectionLabel } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import {
  getDatingPatternTerms,
  type DatingPatternGlossaryTerm,
} from "@/lib/dating-pattern-glossary";

const CATEGORY_LABELS: Record<DatingPatternGlossaryTerm["category"], string> = {
  behavior: "Behavior",
  slang: "Slang",
  status: "Status",
};

export function DatingPatternGlossaryCard({
  compact = false,
}: {
  compact?: boolean;
}) {
  const c = useColors();
  const [open, setOpen] = useState(!compact);
  const terms = open
    ? getDatingPatternTerms()
    : getDatingPatternTerms().slice(0, 4);

  return (
    <Card>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <SectionLabel>Dating dictionary</SectionLabel>
          <Text
            style={{
              color: c.foreground,
              fontSize: 17,
              fontWeight: "700",
            }}
          >
            Pattern slang, translated
          </Text>
        </View>
        <Pressable
          accessibilityLabel={
            open ? "Collapse dating dictionary" : "Open dating dictionary"
          }
          accessibilityRole="button"
          onPress={() => setOpen((v) => !v)}
          hitSlop={10}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Feather
            name={open ? "chevron-up" : "chevron-down"}
            size={18}
            color={c.primary}
          />
        </Pressable>
      </View>
      <Body muted style={{ fontSize: 12, marginTop: 8 }}>
        These are cultural shorthand for patterns people talk about. HeyTelli
        does not assign them as labels or proof.
      </Body>
      <View style={{ gap: 8, marginTop: 12 }}>
        {terms.map((item) => (
          <View
            key={item.term}
            style={{
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: 12,
              padding: 10,
              gap: 5,
              backgroundColor: c.background,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <Text
                style={{
                  color: c.foreground,
                  fontSize: 13,
                  fontWeight: "700",
                }}
              >
                {item.term}
              </Text>
              <Text
                style={{
                  color: c.mutedForeground,
                  fontSize: 10,
                  fontWeight: "600",
                  textTransform: "uppercase",
                }}
              >
                {CATEGORY_LABELS[item.category]}
              </Text>
            </View>
            <Text
              style={{ color: c.mutedForeground, fontSize: 12, lineHeight: 17 }}
            >
              {item.plainMeaning}
            </Text>
          </View>
        ))}
      </View>
      {!open && (
        <Body muted style={{ fontSize: 12, marginTop: 10 }}>
          Tap to see more terms like softboy, roaching, zombieing, and DTR.
        </Body>
      )}
    </Card>
  );
}
