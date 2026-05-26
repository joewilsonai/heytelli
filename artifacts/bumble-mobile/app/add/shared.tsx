import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useIncomingShare } from "expo-sharing";
import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Card, H1, SectionLabel } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import {
  MAX_SHARED_SCREENSHOTS,
  getSharedImageOverflowCount,
  getSharedImages,
} from "@/lib/share-intake";

export default function SharedImportScreen() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { resolvedSharedPayloads, isResolving, error, clearSharedPayloads } =
    useIncomingShare();
  const images = useMemo(
    () => getSharedImages(resolvedSharedPayloads),
    [resolvedSharedPayloads],
  );
  const overflowCount = useMemo(
    () => getSharedImageOverflowCount(resolvedSharedPayloads),
    [resolvedSharedPayloads],
  );

  const cancel = () => {
    clearSharedPayloads();
    router.replace("/");
  };

  const continueImport = () => {
    if (images.length === 0) {
      Alert.alert(
        "No screenshots found",
        "Share one or more images to import.",
      );
      return;
    }

    const encodedUris = encodeURIComponent(
      JSON.stringify(images.map((image) => image.uri)),
    );
    router.replace(`/add?sharedImageUris=${encodedUris}`);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{
        paddingTop: insets.top + 24,
        paddingHorizontal: 20,
        paddingBottom: insets.bottom + 24,
        gap: 14,
      }}
    >
      <H1>Import to HeyTelli</H1>
      <Text style={{ color: c.mutedForeground, fontSize: 14 }}>
        Review the screenshots before HeyTelli reads the conversation.
      </Text>

      {isResolving ? (
        <Card>
          <ActivityIndicator color={c.primary} />
        </Card>
      ) : error ? (
        <Card>
          <SectionLabel>Share Error</SectionLabel>
          <Text style={{ color: c.destructive }}>
            {error.message || "HeyTelli could not read the shared screenshots."}
          </Text>
        </Card>
      ) : images.length === 0 ? (
        <Card>
          <SectionLabel>No Images</SectionLabel>
          <Text style={{ color: c.foreground }}>
            Share screenshots or photos to import them.
          </Text>
        </Card>
      ) : (
        <Card>
          <SectionLabel>
            {images.length} Screenshot{images.length === 1 ? "" : "s"}
          </SectionLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {images.map((image) => (
              <Image
                key={image.uri}
                source={{ uri: image.uri }}
                style={{
                  width: 92,
                  height: 160,
                  borderRadius: 12,
                  backgroundColor: c.muted,
                }}
                contentFit="cover"
              />
            ))}
          </View>
          {overflowCount > 0 && (
            <Text
              style={{
                marginTop: 12,
                color: c.mutedForeground,
                fontSize: 13,
              }}
            >
              HeyTelli imports up to {MAX_SHARED_SCREENSHOTS} screenshots at a
              time. {overflowCount} extra screenshot
              {overflowCount === 1 ? "" : "s"} will be skipped.
            </Text>
          )}
        </Card>
      )}

      <Button
        label="Continue"
        icon="arrow-right"
        onPress={continueImport}
        disabled={isResolving || !!error || images.length === 0}
      />
      <Pressable onPress={cancel} style={{ alignItems: "center", padding: 12 }}>
        <Text
          style={{ color: c.mutedForeground, fontFamily: "Inter_600SemiBold" }}
        >
          Cancel
        </Text>
      </Pressable>
    </ScrollView>
  );
}
