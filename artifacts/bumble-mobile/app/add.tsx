import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { createMatch, previewMatchExtraction } from "@workspace/api-client-react";
import type { ExtractionPreview } from "@workspace/api-client-react";

import { Body, Button, Card, SectionLabel, VibeTag } from "@/components/ui";
import { uploadImage } from "@/lib/upload";

type Step = "pick" | "preview" | "done";

export default function AddMatchScreen() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>("pick");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [objectPath, setObjectPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<ExtractionPreview | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const autoLaunched = useRef(false);

  useEffect(() => {
    if (autoLaunched.current) return;
    autoLaunched.current = true;
    pickFromLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Photos access needed", "Allow photo library access.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (res.canceled) return;
    await uploadAndPreview(res.assets[0].uri);
  };

  const pickFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Camera access needed", "Allow camera access.");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (res.canceled) return;
    await uploadAndPreview(res.assets[0].uri);
  };

  const uploadAndPreview = async (uri: string) => {
    setBusy(true);
    setImageUri(uri);
    try {
      const path = await uploadImage(uri);
      setObjectPath(path);
      const p = await previewMatchExtraction({ objectPath: path });
      setPreview(p);
      setName(p.suggestedName ?? "");
      setStep("preview");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      Alert.alert("Couldn't process screenshot", e?.message ?? "Try again.");
      setImageUri(null);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!objectPath) return;
    setBusy(true);
    try {
      const match = await createMatch({
        screenshotObjectPath: objectPath,
        ...(name.trim() ? { name: name.trim() } : {}),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace(`/match/${match.id}`);
    } catch (e: any) {
      Alert.alert("Couldn't create match", e?.message ?? "Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{
        padding: 20,
        paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 20),
        gap: 14,
      }}
      keyboardShouldPersistTaps="handled"
    >
      {step === "pick" && (
        <>
          <Card>
            <SectionLabel>How it works</SectionLabel>
            <Body muted>
              Snap or upload a screenshot of your match's Bumble profile or chat. AI extracts
              their profile, interests, and conversation tone — and scores compatibility.
            </Body>
          </Card>

          <Pressable
            onPress={pickFromCamera}
            disabled={busy}
            style={({ pressed }) => ({
              backgroundColor: c.primary,
              padding: 20,
              borderRadius: c.radius,
              alignItems: "center",
              gap: 8,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Feather name="camera" size={28} color={c.primaryForeground} />
            <Text
              style={{
                fontSize: 16,
                fontFamily: "Inter_600SemiBold",
                color: c.primaryForeground,
              }}
            >
              Take photo
            </Text>
          </Pressable>

          <Pressable
            onPress={pickFromLibrary}
            disabled={busy}
            style={({ pressed }) => ({
              backgroundColor: c.card,
              borderWidth: 1,
              borderColor: c.border,
              padding: 20,
              borderRadius: c.radius,
              alignItems: "center",
              gap: 8,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Feather name="image" size={28} color={c.foreground} />
            <Text
              style={{
                fontSize: 16,
                fontFamily: "Inter_600SemiBold",
                color: c.foreground,
              }}
            >
              Choose from library
            </Text>
          </Pressable>

          {busy && (
            <View style={{ alignItems: "center", paddingVertical: 16 }}>
              <Body muted>Analyzing screenshot...</Body>
            </View>
          )}
        </>
      )}

      {step === "preview" && preview && (
        <>
          {imageUri && (
            <View style={{ alignItems: "center" }}>
              <Image
                source={imageUri}
                style={{
                  width: 160,
                  height: 280,
                  borderRadius: c.radius,
                  backgroundColor: c.muted,
                }}
                contentFit="cover"
              />
            </View>
          )}
          <Card>
            <SectionLabel>Name</SectionLabel>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Their name"
              placeholderTextColor={c.mutedForeground}
              style={{
                borderWidth: 1,
                borderColor: c.border,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 16,
                fontFamily: "Inter_500Medium",
                color: c.foreground,
              }}
            />
          </Card>
          <Card>
            <SectionLabel>AI extracted</SectionLabel>
            <View style={{ gap: 10 }}>
              {preview.extractedProfile.job && (
                <Row label="Job" value={preview.extractedProfile.job} />
              )}
              {preview.extractedProfile.location && (
                <Row label="Location" value={preview.extractedProfile.location} />
              )}
              {preview.extractedProfile.conversationTone && (
                <Row label="Tone" value={preview.extractedProfile.conversationTone} />
              )}
              {preview.extractedProfile.interests.length > 0 && (
                <View>
                  <Text style={{ fontSize: 12, color: c.mutedForeground, marginBottom: 6 }}>
                    Interests
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {preview.extractedProfile.interests.map((i) => (
                      <VibeTag key={i} label={i} />
                    ))}
                  </View>
                </View>
              )}
              {preview.vibeTags.length > 0 && (
                <View>
                  <Text style={{ fontSize: 12, color: c.mutedForeground, marginBottom: 6 }}>
                    Vibe
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {preview.vibeTags.map((t) => (
                      <VibeTag key={t} label={t} />
                    ))}
                  </View>
                </View>
              )}
            </View>
          </Card>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              label="Try another"
              icon="x"
              onPress={() => {
                setStep("pick");
                setImageUri(null);
                setObjectPath(null);
                setPreview(null);
                setName("");
              }}
              variant="ghost"
              style={{ flex: 1 }}
            />
            <Button
              label="Save match"
              icon="check"
              onPress={save}
              loading={busy}
              style={{ flex: 2 }}
            />
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      <Text style={{ fontSize: 12, color: c.mutedForeground, width: 80 }}>{label}</Text>
      <Text style={{ fontSize: 14, color: c.foreground, flex: 1 }}>{value}</Text>
    </View>
  );
}
