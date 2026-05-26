import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
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
  type ResolvedSharePayload,
  getSharedImageOverflowCount,
  getSharedImages,
} from "@/lib/share-intake";

declare const require: (moduleName: string) => unknown;

type IncomingShareResult = {
  sharedPayloads?: unknown[];
  resolvedSharedPayloads: ResolvedSharePayload[];
  isResolving: boolean;
  error: Error | null;
  clearSharedPayloads: () => void;
};

type UseIncomingShare = () => IncomingShareResult;

function loadIncomingShareHook(): UseIncomingShare | null {
  try {
    const mod = require("expo-sharing") as {
      useIncomingShare?: UseIncomingShare;
    };
    return typeof mod.useIncomingShare === "function"
      ? mod.useIncomingShare
      : null;
  } catch {
    return null;
  }
}

const useIncomingShareSafe =
  loadIncomingShareHook() ??
  (() => ({
    sharedPayloads: [],
    resolvedSharedPayloads: [],
    isResolving: false,
    error: new Error(
      "Screenshot sharing is not linked in this development build.",
    ),
    clearSharedPayloads: () => {},
  }));

export default function SharedImportScreen() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    sharedPayloads = [],
    resolvedSharedPayloads,
    isResolving,
    error,
    clearSharedPayloads,
  } = useIncomingShareSafe();
  const didForward = useRef(false);
  const [emptyPayloadTimedOut, setEmptyPayloadTimedOut] = useState(false);
  const images = useMemo(
    () => getSharedImages(resolvedSharedPayloads),
    [resolvedSharedPayloads],
  );
  const overflowCount = useMemo(
    () => getSharedImageOverflowCount(resolvedSharedPayloads),
    [resolvedSharedPayloads],
  );
  const hasIncomingPayloads =
    sharedPayloads.length > 0 || resolvedSharedPayloads.length > 0;
  const isWaitingForPayload =
    !error &&
    !isResolving &&
    images.length === 0 &&
    !hasIncomingPayloads &&
    !emptyPayloadTimedOut;

  useEffect(() => {
    if (didForward.current || isResolving || error || images.length === 0) {
      return;
    }

    didForward.current = true;
    const encodedUris = encodeURIComponent(
      JSON.stringify(images.map((image) => image.uri)),
    );
    clearSharedPayloads();
    router.replace(`/add?sharedImageUris=${encodedUris}`);
  }, [clearSharedPayloads, error, images, isResolving, router]);

  useEffect(() => {
    if (hasIncomingPayloads || isResolving || error || images.length > 0) {
      setEmptyPayloadTimedOut(false);
      return;
    }

    const timeout = setTimeout(() => setEmptyPayloadTimedOut(true), 1500);
    return () => clearTimeout(timeout);
  }, [error, hasIncomingPayloads, images.length, isResolving]);

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
        Receiving screenshots from the share sheet.
      </Text>

      {isResolving || isWaitingForPayload ? (
        <Card>
          <ActivityIndicator color={c.primary} />
          <Text
            style={{
              marginTop: 12,
              color: c.mutedForeground,
              textAlign: "center",
            }}
          >
            Preparing your import...
          </Text>
        </Card>
      ) : error ? (
        <Card>
          <SectionLabel>Import failed</SectionLabel>
          <Text style={{ color: c.destructive }}>
            {error.message || "HeyTelli could not read the shared screenshots."}
          </Text>
        </Card>
      ) : images.length === 0 ? (
        <Card>
          <SectionLabel>No screenshots found</SectionLabel>
          <Text style={{ color: c.foreground }}>
            The shared item did not include a screenshot or photo HeyTelli can
            import.
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
        label="Continue import"
        icon="arrow-right"
        onPress={continueImport}
        disabled={isResolving || !!error || images.length === 0}
      />
      <Pressable onPress={cancel} style={{ alignItems: "center", padding: 12 }}>
        <Text
          style={{ color: c.mutedForeground, fontWeight: "600" }}
        >
          Cancel
        </Text>
      </Pressable>
    </ScrollView>
  );
}
