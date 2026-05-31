import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import type { MatchDetail } from "@workspace/api-client-react";

import { Body, Button, Card, SectionLabel } from "./ui";
import {
  getCalmReadModel,
  type CalmReadLensTone,
  type CalmReadModel,
} from "@/lib/calm-read";

function toneColors(tone: CalmReadLensTone, c: ReturnType<typeof useColors>) {
  if (tone === "success") {
    return { bg: c.successBg, fg: c.success, border: c.success + "55" };
  }
  if (tone === "warning") {
    return { bg: c.warningBg, fg: c.warning, border: c.warning + "55" };
  }
  if (tone === "danger") {
    return {
      bg: c.destructive + "12",
      fg: c.destructive,
      border: c.destructive + "66",
    };
  }
  if (tone === "primary") {
    return { bg: c.infoBg, fg: c.info, border: c.info + "55" };
  }
  return { bg: c.muted, fg: c.mutedForeground, border: c.border };
}

function LensPill({
  title,
  lens,
  icon,
}: {
  title: string;
  lens: CalmReadModel["safety" | "clarity" | "pace"];
  icon: keyof typeof Feather.glyphMap;
}) {
  const c = useColors();
  const tone = toneColors(lens.tone, c);

  return (
    <View
      style={{
        flexBasis: "31%",
        minWidth: 96,
        flexGrow: 1,
        borderWidth: 1,
        borderColor: tone.border,
        borderRadius: c.radius - 4,
        paddingHorizontal: 10,
        paddingVertical: 10,
        gap: 7,
        backgroundColor: tone.bg,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Feather name={icon} size={13} color={tone.fg} />
        <Text
          style={{
            color: tone.fg,
            fontSize: 11,
            fontWeight: "700",
          }}
          numberOfLines={1}
        >
          {title}
        </Text>
      </View>
      <Text
        style={{
          color: c.foreground,
          fontSize: 14,
          fontWeight: "800",
        }}
        numberOfLines={1}
      >
        {lens.level}
      </Text>
      <Text
        style={{
          color: c.mutedForeground,
          fontSize: 11,
          lineHeight: 15,
        }}
        numberOfLines={3}
      >
        {lens.sentence}
      </Text>
    </View>
  );
}

export function CalmReadCard({
  match,
  onAnalyzeNew,
  analyzingNew,
}: {
  match: MatchDetail;
  onAnalyzeNew: () => void;
  analyzingNew: boolean;
}) {
  const c = useColors();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const model = useMemo(() => getCalmReadModel(match), [match]);
  const freshnessTone = toneColors(model.freshness.tone, c);
  const safetyTone = toneColors(model.safety.tone, c);
  const pending =
    (match.pendingScreenshotCount ?? 0) + (match.failedScreenshotCount ?? 0);
  const canAnalyze =
    match.screenshots.length > 0 &&
    (pending > 0 || match.readFreshness !== "current");
  const hasPatternStates = model.patternStates.length > 0;

  return (
    <Card
      style={{
        borderColor:
          model.safety.tone === "danger" ? safetyTone.border : c.border,
        borderWidth: model.safety.tone === "danger" ? 1.5 : 1,
      }}
    >
      <View style={{ gap: 13 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <View style={{ flex: 1 }}>
            <SectionLabel>{model.label}</SectionLabel>
            <Text
              style={{
                color: c.foreground,
                fontSize: 22,
                fontWeight: "800",
                lineHeight: 27,
              }}
            >
              {model.headline}
            </Text>
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              paddingHorizontal: 9,
              paddingVertical: 5,
              borderRadius: 999,
              backgroundColor: freshnessTone.bg,
              borderWidth: 1,
              borderColor: freshnessTone.border,
              maxWidth: 150,
            }}
          >
            <Feather
              name={
                model.freshness.tone === "success"
                  ? "check-circle"
                  : "refresh-cw"
              }
              size={12}
              color={freshnessTone.fg}
            />
            <Text
              style={{
                color: freshnessTone.fg,
                fontSize: 11,
                fontWeight: "700",
              }}
              numberOfLines={1}
            >
              {model.freshness.label}
            </Text>
          </View>
        </View>

        <Body style={{ fontSize: 14, lineHeight: 20 }}>{model.summary}</Body>

        <View
          style={{
            borderWidth: 1,
            borderColor: safetyTone.border,
            borderRadius: c.radius - 4,
            padding: 11,
            backgroundColor: safetyTone.bg,
            gap: 7,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
            <Feather name="shield" size={15} color={safetyTone.fg} />
            <Text
              style={{ color: safetyTone.fg, fontSize: 12, fontWeight: "800" }}
            >
              Safety Risk: {model.safety.level}
            </Text>
          </View>
          <Text style={{ color: c.foreground, fontSize: 13, lineHeight: 18 }}>
            {model.safety.sentence}
          </Text>
        </View>

        <View
          style={{
            gap: 6,
            paddingTop: 2,
          }}
        >
          <Text
            style={{
              color: c.mutedForeground,
              fontSize: 11,
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: 0,
            }}
          >
            Best next move
          </Text>
          <Text
            style={{
              color: c.foreground,
              fontSize: 15,
              fontWeight: "700",
              lineHeight: 21,
            }}
          >
            {model.nextMove}
          </Text>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <LensPill title="Safety" lens={model.safety} icon="shield" />
          <LensPill title="Clarity" lens={model.clarity} icon="compass" />
          <LensPill title="Pace" lens={model.pace} icon="activity" />
        </View>

        {hasPatternStates ? (
          <View style={{ gap: 7 }}>
            <Text
              style={{
                color: c.mutedForeground,
                fontSize: 11,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 0,
              }}
            >
              Receipts to review
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {model.patternStates.slice(0, 3).map((pattern, index) => (
                <View
                  key={`${pattern.label}-${pattern.state}-${index}`}
                  style={{
                    maxWidth: "100%",
                    borderRadius: 999,
                    paddingHorizontal: 9,
                    paddingVertical: 5,
                    backgroundColor: c.muted,
                  }}
                >
                  <Text
                    style={{
                      color: c.mutedForeground,
                      fontSize: 11,
                      fontWeight: "600",
                    }}
                    numberOfLines={1}
                  >
                    {pattern.state}: {pattern.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 10,
          }}
        >
          {canAnalyze ? (
            <Button
              label={pending > 0 ? "Analyze waiting" : "Refresh read"}
              icon="refresh-cw"
              onPress={onAnalyzeNew}
              loading={analyzingNew}
              small
              style={{ minWidth: 146 }}
            />
          ) : null}
          {model.latestRead ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Toggle latest saved read"
              onPress={() => setDetailsOpen((value) => !value)}
              hitSlop={8}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                minHeight: 36,
                opacity: pressed ? 0.65 : 1,
              })}
            >
              <Text
                style={{ color: c.primary, fontSize: 13, fontWeight: "700" }}
              >
                {detailsOpen ? "Hide saved read" : "Show saved read"}
              </Text>
              <Feather
                name={detailsOpen ? "chevron-up" : "chevron-down"}
                size={14}
                color={c.primary}
              />
            </Pressable>
          ) : null}
        </View>

        {detailsOpen && model.latestRead ? (
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: c.border,
              paddingTop: 12,
              gap: 7,
            }}
          >
            <Text
              style={{
                color: c.mutedForeground,
                fontSize: 11,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 0,
              }}
            >
              {model.latestRead.title} · {model.latestRead.freshnessLabel}
            </Text>
            <Body muted style={{ fontSize: 13, lineHeight: 19 }}>
              {model.latestRead.body}
            </Body>
          </View>
        ) : null}
      </View>
    </Card>
  );
}
