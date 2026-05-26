import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Stack } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Body, Button, Card, H1, H2, SectionLabel } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import {
  MAX_PROFILE_SCREENSHOTS,
  deleteProfileScreenshotUris,
  filterExistingProfileScreenshotUris,
  saveProfileScreenshotUris,
} from "@/lib/local-profile-screenshots";
import {
  analyzeDatingProfileScreenshots,
  isProfileScreenshotUnavailableError,
} from "@/lib/profile-analysis";
import { pickTrustedCircleContact } from "@/lib/trusted-circle-contacts";
import { useUserSettings } from "@/lib/use-user-settings";
import {
  buildProfileReview,
  sanitizeCircleContact,
  stripStoredCirclePhoneNumbers,
  type HeyTelliSettings,
  type TrustedCirclePerson,
} from "@/lib/user-settings";

export default function SettingsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { settings, setSettings, loading } = useUserSettings();
  const [draft, setDraft] = useState<HeyTelliSettings>(settings);
  const [draftDirty, setDraftDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyzingProfile, setAnalyzingProfile] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualRelationship, setManualRelationship] = useState("");

  useEffect(() => {
    if (draftDirty) return;
    setDraft(settings);
  }, [draftDirty, settings]);

  const review = useMemo(
    () => buildProfileReview(draft.datingProfile),
    [draft.datingProfile],
  );

  const updateProfile = (next: Partial<HeyTelliSettings["datingProfile"]>) => {
    setDraftDirty(true);
    setDraft((current) => ({
      ...current,
      datingProfile: {
        ...current.datingProfile,
        ...next,
        updatedAt: new Date().toISOString(),
      },
    }));
  };

  const updateDateDefaults = (
    next: Partial<HeyTelliSettings["dateSafetyDefaults"]>,
  ) => {
    setDraftDirty(true);
    setDraft((current) => ({
      ...current,
      dateSafetyDefaults: {
        ...current.dateSafetyDefaults,
        ...next,
      },
    }));
  };

  const toggleStorePhone = (storePhone: boolean) => {
    if (storePhone) {
      updateDateDefaults({ storePhone: true });
      return;
    }
    setDraftDirty(true);
    setDraft((current) =>
      stripStoredCirclePhoneNumbers({
        ...current,
        dateSafetyDefaults: {
          ...current.dateSafetyDefaults,
          storePhone: false,
        },
      }),
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      await setSettings(draft);
      setDraftDirty(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
    } catch (error: any) {
      Alert.alert("Couldn't save settings", error?.message ?? "Try again.");
    } finally {
      setSaving(false);
    }
  };

  const addPerson = (person: TrustedCirclePerson) => {
    setDraftDirty(true);
    setDraft((current) => {
      const nextCircle = [...current.trustedCircle, person];
      return {
        ...current,
        trustedCircle: nextCircle,
        dateSafetyDefaults: {
          ...current.dateSafetyDefaults,
          primaryCirclePersonId:
            current.dateSafetyDefaults.primaryCirclePersonId ?? person.id,
        },
      };
    });
  };

  const addManualPerson = () => {
    if (!manualName.trim()) {
      Alert.alert("Name needed", "Add a first name or label for this person.");
      return;
    }
    addPerson(
      sanitizeCircleContact(
        {
          fullName: manualName,
          relationship: manualRelationship,
        },
        { source: "manual", storePhone: false },
      ),
    );
    setManualName("");
    setManualRelationship("");
  };

  const addFromContacts = async () => {
    const result = await pickTrustedCircleContact({
      storePhone: draft.dateSafetyDefaults.storePhone,
    });
    if (result.status === "picked") {
      addPerson(result.person);
      return;
    }
    if (result.status === "unavailable") {
      Alert.alert("Contacts unavailable", result.message);
    }
  };

  const removePerson = (id: string) => {
    setDraftDirty(true);
    setDraft((current) => {
      const nextCircle = current.trustedCircle.filter(
        (person) => person.id !== id,
      );
      return {
        ...current,
        trustedCircle: nextCircle,
        dateSafetyDefaults: {
          ...current.dateSafetyDefaults,
          primaryCirclePersonId:
            current.dateSafetyDefaults.primaryCirclePersonId === id
              ? (nextCircle[0]?.id ?? null)
              : current.dateSafetyDefaults.primaryCirclePersonId,
        },
      };
    });
  };

  const pickProfileScreenshots = async () => {
    const existingScreenshots = filterExistingProfileScreenshotUris(
      draft.datingProfile.profileScreenshotUris,
    );
    if (existingScreenshots.skippedScreenshotUris.length > 0) {
      updateProfile({
        profileScreenshotUris: existingScreenshots.profileScreenshotUris,
      });
    }
    const remainingProfileScreenshotSlots =
      MAX_PROFILE_SCREENSHOTS -
      existingScreenshots.profileScreenshotUris.length;
    if (remainingProfileScreenshotSlots <= 0) {
      Alert.alert(
        "Profile screenshots full",
        `You can keep up to ${MAX_PROFILE_SCREENSHOTS} profile screenshots.`,
      );
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Photos access needed", "Allow photo library access.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: remainingProfileScreenshotSlots,
      orderedSelection: true,
    });
    if (result.canceled) return;
    try {
      const localUris = await saveProfileScreenshotUris(
        result.assets
          .map((asset) => asset.uri)
          .filter((uri): uri is string => Boolean(uri)),
      );
      updateProfile({
        profileScreenshotUris: [
          ...existingScreenshots.profileScreenshotUris,
          ...localUris,
        ].slice(0, MAX_PROFILE_SCREENSHOTS),
      });
    } catch (error: any) {
      Alert.alert(
        "Couldn't save screenshots",
        error?.message ?? "Try picking them again.",
      );
    }
  };

  const clearProfileScreenshots = () => {
    const uris = draft.datingProfile.profileScreenshotUris;
    if (uris.length === 0) return;
    Alert.alert(
      "Clear profile screenshots?",
      "This only removes the local screenshot copies from Settings.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear screenshots",
          style: "destructive",
          onPress: () => {
            deleteProfileScreenshotUris(uris);
            updateProfile({ profileScreenshotUris: [] });
          },
        },
      ],
    );
  };

  const analyzeProfile = async () => {
    if (draft.datingProfile.profileScreenshotUris.length === 0) {
      Alert.alert("Add screenshots first", "Upload profile screenshots first.");
      return;
    }
    setAnalyzingProfile(true);
    try {
      const analysis = await analyzeDatingProfileScreenshots(
        draft.datingProfile.profileScreenshotUris,
      );
      updateProfile({
        profileScreenshotUris: analysis.profileScreenshotUris,
        profileText: analysis.profileText,
        lookingFor: analysis.lookingFor,
        boundaries: analysis.boundaries,
        photoNotes: analysis.photoNotes,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
      Alert.alert(
        "Profile analyzed",
        analysis.skippedScreenshotUris.length > 0
          ? `HeyTelli filled your profile fields and removed ${analysis.skippedScreenshotUris.length} unavailable screenshot${analysis.skippedScreenshotUris.length === 1 ? "" : "s"}.`
          : "HeyTelli filled your profile fields.",
      );
    } catch (error: any) {
      if (isProfileScreenshotUnavailableError(error)) {
        updateProfile({ profileScreenshotUris: error.profileScreenshotUris });
        Alert.alert("Screenshots removed", error.message);
        return;
      }
      Alert.alert("Couldn't analyze profile", error?.message ?? "Try again.");
    } finally {
      setAnalyzingProfile(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{
        paddingTop: insets.top + 48,
        paddingHorizontal: 20,
        paddingBottom: insets.bottom + 32,
        gap: 14,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen
        options={{ title: "Settings", headerTintColor: c.foreground }}
      />
      <View style={{ gap: 4 }}>
        <H1>Settings</H1>
        <Body muted>
          Your profile, circle, and date defaults stay private on this phone.
        </Body>
      </View>

      <Card>
        <SectionLabel>My Dating Profile</SectionLabel>
        <H2 style={{ fontSize: 18 }}>Profile Review</H2>
        <Body muted style={{ marginTop: 4 }}>
          Upload or paste your profile so HeyTelli can help spot privacy leaks,
          clarity gaps, and the kind of matches it may attract.
        </Body>
        <View style={{ gap: 10, marginTop: 12 }}>
          <Input
            placeholder="What are you looking for?"
            value={draft.datingProfile.lookingFor}
            onChangeText={(lookingFor) => updateProfile({ lookingFor })}
          />
          <Input
            placeholder="Paste your profile prompts or bio"
            value={draft.datingProfile.profileText}
            onChangeText={(profileText) => updateProfile({ profileText })}
            multiline
          />
          <Input
            placeholder="Boundaries or non-negotiables"
            value={draft.datingProfile.boundaries}
            onChangeText={(boundaries) => updateProfile({ boundaries })}
            multiline
          />
          <Input
            placeholder="Photo notes, e.g. badge, neighborhood, gym"
            value={draft.datingProfile.photoNotes}
            onChangeText={(photoNotes) => updateProfile({ photoNotes })}
            multiline
          />
          <Button
            label={
              draft.datingProfile.profileScreenshotUris.length
                ? `${draft.datingProfile.profileScreenshotUris.length}/${MAX_PROFILE_SCREENSHOTS} profile screenshots selected`
                : "Upload profile screenshots"
            }
            icon="image"
            variant="secondary"
            onPress={pickProfileScreenshots}
          />
          {draft.datingProfile.profileScreenshotUris.length > 0 ? (
            <Button
              label="Clear screenshots"
              icon="trash-2"
              variant="ghost"
              onPress={clearProfileScreenshots}
            />
          ) : null}
          <Button
            label="Analyze Profile"
            icon="zap"
            onPress={analyzeProfile}
            loading={analyzingProfile}
            disabled={
              analyzingProfile ||
              draft.datingProfile.profileScreenshotUris.length === 0
            }
          />
        </View>
        <ReviewBlock
          title="Strengths"
          items={review.strengths}
          tone="success"
        />
        <ReviewBlock
          title="Privacy to tighten"
          items={review.privacyWarnings}
          tone="warning"
        />
        <ReviewBlock
          title="Clarity to tighten"
          items={review.clarityWarnings}
          tone="warning"
        />
      </Card>

      <Card>
        <SectionLabel>Trusted Circle</SectionLabel>
        <Body muted>
          HeyTelli stores names locally for Date Cards. Contact access is only
          used when you tap Add from Contacts.
        </Body>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <Button
            label="Add from Contacts"
            icon="user-plus"
            onPress={addFromContacts}
            variant="secondary"
            style={{ flex: 1 }}
          />
        </View>
        <View style={{ gap: 8, marginTop: 12 }}>
          <Input
            placeholder="First name or label"
            value={manualName}
            onChangeText={setManualName}
          />
          <Input
            placeholder="Relationship, e.g. sister, roommate"
            value={manualRelationship}
            onChangeText={setManualRelationship}
          />
          <Button
            label="Add manually"
            icon="plus"
            variant="ghost"
            onPress={addManualPerson}
          />
        </View>
        <View style={{ gap: 8, marginTop: 12 }}>
          {draft.trustedCircle.length === 0 ? (
            <Body muted>No circle people yet.</Body>
          ) : (
            draft.trustedCircle.map((person) => (
              <CirclePersonRow
                key={person.id}
                person={person}
                selected={
                  draft.dateSafetyDefaults.primaryCirclePersonId === person.id
                }
                onSelect={() =>
                  updateDateDefaults({ primaryCirclePersonId: person.id })
                }
                onRemove={() => removePerson(person.id)}
              />
            ))
          )}
        </View>
      </Card>

      <Card>
        <SectionLabel>Date Safety Defaults</SectionLabel>
        <Body muted>
          These prefill every new Date Card. You can still edit each date before
          sharing.
        </Body>
        <View style={{ gap: 10, marginTop: 12 }}>
          <Input
            placeholder="Default transport / exit plan"
            value={draft.dateSafetyDefaults.transportPlan}
            onChangeText={(transportPlan) =>
              updateDateDefaults({ transportPlan })
            }
          />
          <Input
            placeholder="Code word (optional)"
            value={draft.dateSafetyDefaults.codeWord}
            onChangeText={(codeWord) => updateDateDefaults({ codeWord })}
          />
          <Input
            placeholder="Default circle note (optional)"
            value={draft.dateSafetyDefaults.circleNote}
            onChangeText={(circleNote) => updateDateDefaults({ circleNote })}
            multiline
          />
          <Input
            keyboardType="number-pad"
            placeholder="Check-in minutes after start"
            value={String(draft.dateSafetyDefaults.checkInOffsetMinutes)}
            onChangeText={(value) =>
              updateDateDefaults({
                checkInOffsetMinutes: clampMinutes(value, 15, 240),
              })
            }
          />
          <Input
            keyboardType="number-pad"
            placeholder="Expected end minutes after start"
            value={String(draft.dateSafetyDefaults.expectedEndOffsetMinutes)}
            onChangeText={(value) =>
              updateDateDefaults({
                expectedEndOffsetMinutes: clampMinutes(value, 60, 720),
              })
            }
          />
          <SwitchRow
            label="Date-only location intent"
            body="Date Cards say location is date-only if you turn it on."
            value={draft.dateSafetyDefaults.shareLiveLocation}
            onValueChange={(shareLiveLocation) =>
              updateDateDefaults({ shareLiveLocation })
            }
          />
          <SwitchRow
            label="Keep phone numbers"
            body="Off by default. Turning it off removes any saved numbers."
            value={draft.dateSafetyDefaults.storePhone}
            onValueChange={toggleStorePhone}
          />
        </View>
      </Card>

      <Button
        label={loading ? "Loading" : "Save Settings"}
        icon="save"
        onPress={save}
        loading={saving || loading}
      />
    </ScrollView>
  );
}

function clampMinutes(value: string, min: number, max: number): number {
  const parsed = Number.parseInt(value.replace(/\D/g, ""), 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

function ReviewBlock({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "success" | "warning";
}) {
  const c = useColors();
  const color = tone === "success" ? c.success : c.warning;
  return (
    <View style={{ marginTop: 12, gap: 7 }}>
      <Text
        style={{
          color,
          fontSize: 12,
          fontFamily: "Inter_700Bold",
          textTransform: "uppercase",
        }}
      >
        {title}
      </Text>
      {items.length === 0 ? (
        <Body muted style={{ fontSize: 12 }}>
          Nothing flagged yet.
        </Body>
      ) : (
        items.map((item) => (
          <View
            key={item}
            style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}
          >
            <Feather
              name={tone === "success" ? "check-circle" : "alert-triangle"}
              size={14}
              color={color}
            />
            <Text style={{ color: c.foreground, fontSize: 12, flex: 1 }}>
              {item}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

function CirclePersonRow({
  person,
  selected,
  onSelect,
  onRemove,
}: {
  person: TrustedCirclePerson;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const c = useColors();
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: selected ? c.primary : c.border,
        borderRadius: 12,
        padding: 12,
        backgroundColor: c.background,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: selected ? c.primary : c.muted,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: selected ? c.primaryForeground : c.foreground,
              fontFamily: "Inter_700Bold",
            }}
          >
            {person.name.slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: c.foreground,
              fontSize: 14,
              fontFamily: "Inter_700Bold",
            }}
          >
            {person.name}
          </Text>
          <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
            {person.relationship ?? "Circle person"} · {person.source}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button
          label={selected ? "Default" : "Use for Date Cards"}
          icon={selected ? "check" : "users"}
          onPress={onSelect}
          variant={selected ? "secondary" : "ghost"}
          small
          style={{ flex: 1 }}
        />
        <Button
          label="Remove"
          icon="trash-2"
          onPress={onRemove}
          variant="ghost"
          small
        />
      </View>
    </View>
  );
}

function SwitchRow({
  label,
  body,
  value,
  onValueChange,
}: {
  label: string;
  body: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 10,
        padding: 12,
        backgroundColor: c.background,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            color: c.foreground,
            fontSize: 14,
            fontFamily: "Inter_600SemiBold",
          }}
        >
          {label}
        </Text>
        <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{body}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

function Input(props: React.ComponentProps<typeof TextInput>) {
  const c = useColors();
  return (
    <TextInput
      placeholderTextColor={c.mutedForeground}
      {...props}
      style={[
        {
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: 14,
          fontFamily: "Inter_400Regular",
          color: c.foreground,
          backgroundColor: c.background,
          minHeight: props.multiline ? 88 : undefined,
          textAlignVertical: props.multiline ? "top" : "center",
        },
        props.style,
      ]}
    />
  );
}
