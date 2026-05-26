import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  Text,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";
import { getRedFlagRadar } from "@workspace/api-client-react";
import type {
  RedFlag,
  RedFlagRadarResult,
  RedFlagSummary,
} from "@workspace/api-client-react";

import { Body, Card, SectionLabel } from "./ui";
import { getSafetyActionChecklist } from "@/lib/safety-action-checklist";
import { getSafetyResources } from "@/lib/safety-resources";

export function RedFlagsCard({
  matchId,
  promoted = false,
  initialSummary,
  initialRedFlags,
}: {
  matchId: number;
  promoted?: boolean;
  initialSummary?: RedFlagSummary;
  initialRedFlags?: {
    redFlags: RedFlag[];
    currentRedFlags: RedFlag[];
    historicalRedFlags: RedFlag[];
  };
}) {
  const c = useColors();
  const [data, setData] = useState<RedFlagRadarResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(
    () => (initialRedFlags?.redFlags.length ?? 0) > 0,
  );

  const run = async () => {
    setLoading(true);
    try {
      const r = await getRedFlagRadar(matchId);
      setData(r);
      setOpen(true);
    } catch (e: any) {
      Alert.alert("Couldn't analyze", e?.message ?? "Try again.");
    } finally {
      setLoading(false);
    }
  };

  const sevColor = (s: "low" | "medium" | "high") =>
    s === "high"
      ? c.destructive
      : s === "medium"
        ? c.warning
        : c.mutedForeground;

  const summary = data?.redFlagSummary ?? initialSummary;
  const hasHighFlag = (summary?.highSeverityCount ?? 0) > 0;
  const flagCount =
    data?.redFlags.length ??
    initialRedFlags?.redFlags?.length ??
    (summary?.currentCount ?? 0) + (summary?.historicalCount ?? 0);
  const showAlert = promoted && hasHighFlag;
  const currentFlags = data?.currentRedFlags.length
    ? data.currentRedFlags
    : initialRedFlags?.currentRedFlags?.length
      ? initialRedFlags.currentRedFlags
      : (data?.redFlags.filter((f) => f.status !== "previously-seen") ??
        initialRedFlags?.redFlags.filter(
          (f) => f.status !== "previously-seen",
        ) ??
        []);
  const historicalFlags = data?.historicalRedFlags.length
    ? data.historicalRedFlags
    : initialRedFlags?.historicalRedFlags?.length
      ? initialRedFlags.historicalRedFlags
      : (data?.redFlags.filter((f) => f.status === "previously-seen") ??
        initialRedFlags?.redFlags.filter(
          (f) => f.status === "previously-seen",
        ) ??
        []);
  const hasSavedDetails = currentFlags.length > 0 || historicalFlags.length > 0;
  const greenFlags = data?.greenFlags ?? [];
  const overallRead = data?.overallRead ?? "";
  const resources = getSafetyResources([...currentFlags, ...historicalFlags]);
  const actionChecklist = getSafetyActionChecklist([
    ...currentFlags,
    ...historicalFlags,
  ]);

  const renderFlagList = (title: string, flags: RedFlag[], muted = false) => (
    <View style={{ gap: 6 }}>
      <Text
        style={{
          fontSize: 12,
          color: muted ? c.mutedForeground : c.destructive,
          fontFamily: "Inter_600SemiBold",
          letterSpacing: 0.5,
        }}
      >
        {title}
      </Text>
      {flags.map((f, i) => (
        <View key={`${title}-${i}`} style={{ gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: sevColor(f.severity),
              }}
            />
            <Text
              style={{
                color: c.foreground,
                fontFamily: "Inter_600SemiBold",
                fontSize: 13,
              }}
            >
              {f.label}
            </Text>
          </View>
          <Text
            style={{ color: c.mutedForeground, fontSize: 12, marginLeft: 14 }}
          >
            {f.evidence}
          </Text>
        </View>
      ))}
    </View>
  );

  return (
    <Card
      style={
        showAlert
          ? {
              borderColor: c.destructive,
              borderWidth: 2,
            }
          : promoted
            ? { borderColor: c.primary, borderWidth: 1.5 }
            : undefined
      }
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Feather
            name="shield"
            size={16}
            color={
              showAlert ? c.destructive : promoted ? c.primary : c.foreground
            }
          />
          <SectionLabel>Pattern radar</SectionLabel>
          {flagCount > 0 && (
            <View
              style={{
                backgroundColor: c.destructive,
                borderRadius: 999,
                paddingHorizontal: 7,
                paddingVertical: 1,
              }}
            >
              <Text
                style={{
                  color: c.destructiveForeground,
                  fontSize: 10,
                  fontFamily: "Inter_700Bold",
                }}
              >
                {flagCount}
              </Text>
            </View>
          )}
        </View>
        <Pressable
          onPress={data || hasSavedDetails ? () => setOpen((v) => !v) : run}
          disabled={loading}
          hitSlop={8}
        >
          {loading ? (
            <ActivityIndicator size="small" color={c.primary} />
          ) : (
            <Feather
              name={
                data || hasSavedDetails
                  ? open
                    ? "chevron-up"
                    : "chevron-down"
                  : "zap"
              }
              size={18}
              color={c.primary}
            />
          )}
        </Pressable>
      </View>
      {!data && !open && (
        <Body muted style={{ fontSize: 12, marginTop: 4 }}>
          {flagCount > 0
            ? `${flagCount} saved pattern${flagCount === 1 ? "" : "s"} on this match.`
            : promoted
              ? "Scan chat and notes for behavioral patterns before you reply."
              : "Scan chat, dates, and notes for behavioral patterns."}
        </Body>
      )}
      {(data || hasSavedDetails) && open && (
        <View style={{ marginTop: 10, gap: 12 }}>
          {overallRead ? (
            <View
              style={{
                padding: 10,
                backgroundColor: c.muted,
                borderRadius: 10,
              }}
            >
              <Text
                style={{
                  color: c.foreground,
                  fontSize: 13,
                  fontStyle: "italic",
                }}
              >
                "{overallRead}"
              </Text>
            </View>
          ) : null}
          {currentFlags.length > 0 &&
            renderFlagList(
              data ? "CURRENT PATTERNS" : "SAVED PATTERNS",
              currentFlags,
            )}
          {historicalFlags.length > 0 &&
            renderFlagList("SEEN BEFORE", historicalFlags, true)}
          {actionChecklist.length > 0 ? (
            <View
              style={{
                gap: 8,
                padding: 10,
                backgroundColor: c.warningBg,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: c.warning + "33",
              }}
            >
              <Text
                style={{
                  color: c.warning,
                  fontSize: 12,
                  fontFamily: "Inter_600SemiBold",
                  letterSpacing: 0.5,
                }}
              >
                OPTIONS TO CONSIDER
              </Text>
              {actionChecklist.map((action) => (
                <View
                  key={action.label}
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    alignItems: "flex-start",
                  }}
                >
                  <Feather
                    name="check-circle"
                    size={14}
                    color={action.tone === "danger" ? c.destructive : c.warning}
                  />
                  <Text
                    style={{
                      flex: 1,
                      color: c.foreground,
                      fontSize: 12,
                      lineHeight: 17,
                    }}
                  >
                    {action.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {resources.length > 0 ? (
            <View
              style={{
                gap: 8,
                padding: 10,
                backgroundColor: c.destructive + "10",
                borderRadius: 10,
                borderWidth: 1,
                borderColor: c.destructive + "33",
              }}
            >
              <Text
                style={{
                  color: c.destructive,
                  fontSize: 12,
                  fontFamily: "Inter_600SemiBold",
                  letterSpacing: 0.5,
                }}
              >
                SUPPORT OPTIONS
              </Text>
              <Body muted style={{ fontSize: 12 }}>
                You do not owe money, photos, secrecy, or proof. Save originals
                if you may need to report later.
              </Body>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {resources.map((resource) => (
                  <Pressable
                    key={resource.url}
                    onPress={() => Linking.openURL(resource.url)}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 5,
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                      borderRadius: 999,
                      backgroundColor: c.card,
                      borderWidth: 1,
                      borderColor: c.border,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Feather
                      name="external-link"
                      size={12}
                      color={c.foreground}
                    />
                    <Text
                      style={{
                        color: c.foreground,
                        fontSize: 12,
                        fontFamily: "Inter_600SemiBold",
                      }}
                    >
                      {resource.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          {greenFlags.length > 0 ? (
            <View style={{ gap: 6 }}>
              <Text
                style={{
                  fontSize: 12,
                  color: c.success,
                  fontFamily: "Inter_600SemiBold",
                  letterSpacing: 0.5,
                }}
              >
                💚 GREEN FLAGS
              </Text>
              {greenFlags.map((f, i) => (
                <View key={i} style={{ gap: 2 }}>
                  <Text
                    style={{
                      color: c.foreground,
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 13,
                    }}
                  >
                    {f.label}
                  </Text>
                  <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
                    {f.evidence}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          <Pressable onPress={run} disabled={loading} hitSlop={8}>
            <Text
              style={{
                color: c.primary,
                fontSize: 12,
                fontFamily: "Inter_500Medium",
              }}
            >
              Re-analyze
            </Text>
          </Pressable>
        </View>
      )}
    </Card>
  );
}
