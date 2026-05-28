import { Feather } from "@expo/vector-icons";
import { Stack } from "expo-router";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Body, Card, SectionLabel } from "@/components/ui";
import { DatingPatternGlossaryCard } from "@/components/DatingPatternGlossaryCard";
import { useColors } from "@/hooks/useColors";

const TRUST_ITEMS = [
  {
    icon: "image" as const,
    title: "Server screenshots are temporary",
    body: "Screenshots are uploaded only long enough for analysis, then the backend purges the raw image. A private copy can stay on this iPhone so you can review or resubmit it later without HeyTelli keeping it on the server.",
  },
  {
    icon: "share-2" as const,
    title: "Date Cards never include screenshots",
    body: "Circle shares use first name, date time, location, transport, check-in, expected end, optional code word, and your optional note. No profile photos or conversation images are included.",
  },
  {
    icon: "users" as const,
    title: "Your circle stays local",
    body: "Trusted Circle entries are saved on this phone for Date Card defaults. Contacts are only read when you tap Add from Contacts, and phone storage stays off unless you explicitly enable it.",
  },
  {
    icon: "trash-2" as const,
    title: "Delete a match deletes its history",
    body: "Deleting a match removes linked chat history, local screenshots, notes, timeline events, and saved safety data for that match.",
  },
];

export default function TrustScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();

  return (
    <>
      <Stack.Screen options={{ title: "Trust Center" }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: c.background }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 28,
          gap: 14,
        }}
      >
        <Card>
          <SectionLabel>Trust Center</SectionLabel>
          <Text
            style={{
              color: c.foreground,
              fontSize: 22,
              fontWeight: "700",
              marginBottom: 8,
            }}
          >
            Private safety tools, not a gossip network
          </Text>
          <Body muted>
            HeyTelli is built around local sharing, screenshot minimization, and
            delete controls so the safety layer stays private.
          </Body>
        </Card>

        {TRUST_ITEMS.map((item) => (
          <Card key={item.title}>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: c.muted,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name={item.icon} size={17} color={c.primary} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text
                  style={{
                    color: c.foreground,
                    fontSize: 15,
                    fontWeight: "600",
                  }}
                >
                  {item.title}
                </Text>
                <Body muted style={{ fontSize: 13, lineHeight: 19 }}>
                  {item.body}
                </Body>
              </View>
            </View>
          </Card>
        ))}
        <DatingPatternGlossaryCard />
      </ScrollView>
    </>
  );
}
