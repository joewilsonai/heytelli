import { Feather } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useGetResponseStats } from "@workspace/api-client-react";

import { Card, SectionLabel } from "./ui";

type Pattern = {
  label: string;
  tint: string;
  blurb: string;
  icon: any;
};

function classify(d: {
  herAvgReplyHours: number | null;
  meAvgReplyHours: number | null;
  longestHerSilenceHours: number | null;
  herMessageCount: number;
  meMessageCount: number;
  cadenceBalance: string;
}): Pattern {
  const her = d.herAvgReplyHours;
  const me = d.meAvgReplyHours;
  const gap = d.longestHerSilenceHours;
  // Love-bombing: very fast + lopsided toward him initiating
  if (
    her != null &&
    her < 0.5 &&
    d.herMessageCount > d.meMessageCount * 1.5 &&
    d.herMessageCount >= 6
  ) {
    return {
      label: "Love-bombing",
      tint: "#C2410C",
      icon: "alert-octagon",
      blurb: "Replying within minutes and dominating the thread. Calibrate carefully.",
    };
  }
  // Going dark
  if (gap != null && gap > 72) {
    return {
      label: "Going dark",
      tint: "#DC2626",
      icon: "moon",
      blurb: `Longest silence: ${Math.round(gap)}h. Inconsistent investment.`,
    };
  }
  // Breadcrumbing: slow + short bursts
  if (her != null && her > 12 && d.herMessageCount < d.meMessageCount * 0.7) {
    return {
      label: "Breadcrumbing",
      tint: "#B45309",
      icon: "minus-circle",
      blurb: "Slow replies and you carrying the conversation. Low effort.",
    };
  }
  // Fading
  if (her != null && me != null && her > me * 3) {
    return {
      label: "Fading",
      tint: "#B45309",
      icon: "trending-down",
      blurb: "His replies are getting slower than yours. Energy is drifting.",
    };
  }
  // You chasing
  if (d.cadenceBalance === "you_chasing") {
    return {
      label: "Leading",
      tint: "#B45309",
      icon: "arrow-up-right",
      blurb: "You're initiating more than he is. Worth a beat to see if he leans in.",
    };
  }
  // Healthy
  if (d.cadenceBalance === "balanced") {
    return {
      label: "Steady",
      tint: "#15803D",
      icon: "check-circle",
      blurb: "Reciprocal pace. Both showing up.",
    };
  }
  if (d.cadenceBalance === "she_chasing") {
    return {
      label: "Steady",
      tint: "#15803D",
      icon: "arrow-down-left",
      blurb: "He's investing more than you. Take it in.",
    };
  }
  return {
    label: "Not enough data",
    tint: "#6B6359",
    icon: "help-circle",
    blurb: "Add more screenshots so we can read the pattern.",
  };
}

function Stat({ label, value, tint }: { label: string; value: string; tint?: string }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text
        style={{
          fontSize: 10,
          color: c.mutedForeground,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Text>
      <Text style={{ fontSize: 16, fontWeight: "700", color: tint ?? c.foreground }}>
        {value}
      </Text>
    </View>
  );
}

export function ResponseStatsCard({ matchId }: { matchId: number }) {
  const c = useColors();
  const { data, isLoading } = useGetResponseStats(matchId);

  if (isLoading || !data) return null;

  const pattern = classify(data);
  const fmt = (h: number | null) =>
    h == null ? "—" : h < 1 ? `${Math.round(h * 60)}m` : `${Math.round(h)}h`;

  return (
    <Card>
      <SectionLabel>Pattern</SectionLabel>
      <View style={{ marginTop: 8, gap: 12 }}>
        <View
          style={{
            padding: 12,
            borderRadius: 10,
            backgroundColor: pattern.tint + "12",
            borderWidth: 1,
            borderColor: pattern.tint + "55",
            gap: 6,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name={pattern.icon} size={14} color={pattern.tint} />
            <Text
              style={{ color: pattern.tint, fontSize: 13, fontWeight: "700" }}
            >
              {pattern.label}
            </Text>
          </View>
          <Text style={{ color: c.foreground, fontSize: 12, lineHeight: 17 }}>
            {pattern.blurb}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Stat label="His avg" value={fmt(data.herAvgReplyHours)} />
          <Stat label="Your avg" value={fmt(data.meAvgReplyHours)} />
          <Stat label="Longest gap" value={fmt(data.longestHerSilenceHours)} />
        </View>
        <Text style={{ fontSize: 10, color: c.mutedForeground, fontStyle: "italic" }}>
          Timing is approximated from screenshot upload gaps.
        </Text>
      </View>
    </Card>
  );
}
