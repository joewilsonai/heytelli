import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { useColors } from "@/hooks/useColors";
import { useGetMatch } from "@workspace/api-client-react";

import { EmptyState, Skeleton } from "@/components/ui";
import { objectPathToUrl } from "@/lib/image";
import {
  getLocalMatchScreenshotUri,
  useLocalMatchScreenshots,
} from "@/lib/local-match-screenshots";

export default function PhotoGalleryScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const matchId = Number(id);
  const { data, isLoading } = useGetMatch(matchId);
  const { screenshots: localScreenshots } = useLocalMatchScreenshots();

  const width = Dimensions.get("window").width;
  const cols = width > 600 ? 3 : 2;
  const gap = 6;
  const itemSize = (width - 32 - gap * (cols - 1)) / cols;

  return (
    <>
      <Stack.Screen
        options={{
          headerTintColor: c.foreground,
          title: data?.name ? `${data.name} · Photos` : "Photos",
        }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: c.background }}
        contentContainerStyle={{
          paddingTop: insets.top + 50,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 20),
          gap: 12,
        }}
      >
        {isLoading ? (
          <View style={{ gap: 8 }}>
            <Skeleton height={120} />
            <Skeleton height={120} />
          </View>
        ) : !data || data.screenshots.length === 0 ? (
          <EmptyState
            icon="image"
            title="No photos yet"
            hint="Screenshots you add to this match will appear here."
            action={{ label: "Go back", onPress: () => router.back() }}
          />
        ) : (
          <>
            <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
              {data.screenshots.length} screenshot
              {data.screenshots.length === 1 ? "" : "s"}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
              {data.screenshots.map((s) => {
                const localUri = getLocalMatchScreenshotUri(
                  localScreenshots,
                  matchId,
                  s.id,
                );
                const uri = objectPathToUrl(s.objectPath) ?? localUri;
                const localOnly = !s.objectPath && Boolean(localUri);
                return (
                  <View
                    key={s.id}
                    style={{
                      width: itemSize,
                      height: itemSize,
                      borderRadius: 10,
                      overflow: "hidden",
                      backgroundColor: c.muted,
                    }}
                  >
                    {uri ? (
                      <>
                        <Image
                          source={uri}
                          style={{ width: "100%", height: "100%" }}
                          contentFit="cover"
                          transition={150}
                        />
                        {localOnly && (
                          <View
                            style={{
                              position: "absolute",
                              left: 6,
                              bottom: 6,
                              borderRadius: 999,
                              backgroundColor: "rgba(0,0,0,0.64)",
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                            }}
                          >
                            <Text
                              style={{
                                color: "#fff",
                                fontSize: 10,
                                fontWeight: "700",
                              }}
                            >
                              On this iPhone
                            </Text>
                          </View>
                        )}
                      </>
                    ) : (
                      <View
                        style={{
                          flex: 1,
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                        }}
                      >
                        <Feather
                          name={s.rawImagePurgedAt ? "check-circle" : "image"}
                          size={20}
                          color={
                            s.rawImagePurgedAt ? c.success : c.mutedForeground
                          }
                        />
                        {s.rawImagePurgedAt ? (
                          <Text
                            style={{
                              color: c.mutedForeground,
                              fontSize: 11,
                              fontWeight: "600",
                            }}
                          >
                            Analyzed
                          </Text>
                        ) : null}
                      </View>
                    )}
                    {s.extractionStatus !== "done" && (
                      <View
                        style={{
                          position: "absolute",
                          bottom: 4,
                          left: 4,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 6,
                          backgroundColor:
                            s.extractionStatus === "failed"
                              ? c.destructive
                              : c.warning,
                        }}
                      >
                        <Text style={{ color: "#fff", fontSize: 9 }}>
                          {s.extractionStatus}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </>
        )}
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({
            marginTop: 8,
            alignSelf: "flex-start",
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Feather name="arrow-left" size={14} color={c.primary} />
          <Text
            style={{
              color: c.primary,
              fontSize: 13,
              fontWeight: "500",
            }}
          >
            Back to match
          </Text>
        </Pressable>
      </ScrollView>
    </>
  );
}
