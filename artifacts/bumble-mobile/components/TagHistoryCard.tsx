import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useGetTagHistory } from "@workspace/api-client-react";

import { Body, Card, SectionLabel } from "./ui";

function relTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const day = Math.floor(h / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  return `${mo}mo ago`;
}

export function TagHistoryCard({ matchId }: { matchId: number }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useGetTagHistory(matchId, {
    query: { enabled: open },
  });

  return (
    <Card>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
      >
        <SectionLabel>Tag history</SectionLabel>
        <Feather name={open ? "chevron-up" : "chevron-down"} size={16} color={c.mutedForeground} />
      </Pressable>
      {!open && (
        <Body muted style={{ fontSize: 12, marginTop: 4 }}>
          Timeline of every tag change.
        </Body>
      )}
      {open && (
        <View style={{ marginTop: 10 }}>
          {isLoading && <ActivityIndicator size="small" color={c.primary} />}
          {!isLoading && data && data.events.length === 0 && (
            <Body muted style={{ fontSize: 12 }}>
              No changes yet — tags you add or AI suggestions you apply will appear here.
            </Body>
          )}
          {!isLoading && data && data.events.length > 0 && (
            <View style={{ gap: 8 }}>
              {data.events.map((e) => {
                const isAdd = e.action === "added";
                const tint = isAdd ? "#10B981" : "#EF4444";
                const created = new Date(e.createdAt);
                return (
                  <View
                    key={e.id}
                    style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}
                  >
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        backgroundColor: tint + "22",
                        alignItems: "center",
                        justifyContent: "center",
                        marginTop: 1,
                      }}
                    >
                      <Feather name={isAdd ? "plus" : "minus"} size={11} color={tint} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        <Text
                          style={{
                            color: c.foreground,
                            fontSize: 13,
                            fontFamily: "Inter_600SemiBold",
                          }}
                        >
                          {e.tag}
                        </Text>
                        <Text
                          style={{
                            color: e.source === "ai" ? c.primary : c.mutedForeground,
                            fontSize: 10,
                            fontFamily: "Inter_500Medium",
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                          }}
                        >
                          {e.source}
                        </Text>
                        <Text style={{ color: c.mutedForeground, fontSize: 11 }}>
                          · {relTime(created)}
                        </Text>
                      </View>
                      {e.reason ? (
                        <Text style={{ color: c.mutedForeground, fontSize: 11, marginTop: 2 }}>
                          {e.reason}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}
    </Card>
  );
}
