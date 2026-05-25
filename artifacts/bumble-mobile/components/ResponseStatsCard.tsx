import React from "react";
import { Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useGetResponseStats } from "@workspace/api-client-react";

import { Card, SectionLabel } from "./ui";

const CADENCE_LABEL: Record<string, { label: string; tint: string }> = {
  you_chasing: { label: "You're chasing", tint: "#EF4444" },
  balanced: { label: "Balanced", tint: "#10B981" },
  she_chasing: { label: "She's chasing", tint: "#10B981" },
  unknown: { label: "Not enough data", tint: "#9CA3AF" },
};

function Stat({ label, value, tint }: { label: string; value: string; tint?: string }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ fontSize: 10, color: c.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </Text>
      <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: tint ?? c.foreground }}>
        {value}
      </Text>
    </View>
  );
}

export function ResponseStatsCard({ matchId }: { matchId: number }) {
  const c = useColors();
  const { data, isLoading } = useGetResponseStats(matchId);

  if (isLoading || !data) return null;

  const meta = CADENCE_LABEL[data.cadenceBalance] ?? CADENCE_LABEL.unknown;
  const fmt = (h: number | null) => (h == null ? "—" : h < 1 ? `${Math.round(h * 60)}m` : `${h}h`);

  return (
    <Card>
      <SectionLabel>Response cadence</SectionLabel>
      <View style={{ marginTop: 8, gap: 12 }}>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: meta.tint + "22",
            alignSelf: "flex-start",
          }}
        >
          <Text style={{ color: meta.tint, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
            {meta.label}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Stat label="Her avg" value={fmt(data.herAvgReplyHours)} />
          <Stat label="Your avg" value={fmt(data.meAvgReplyHours)} />
          <Stat label="Longest gap" value={fmt(data.longestHerSilenceHours)} />
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Stat label="Her msgs" value={String(data.herMessageCount)} />
          <Stat label="Your msgs" value={String(data.meMessageCount)} />
        </View>
        <Text style={{ fontSize: 10, color: c.mutedForeground, fontStyle: "italic" }}>
          Timing is approximated from screenshot upload gaps.
        </Text>
      </View>
    </Card>
  );
}
