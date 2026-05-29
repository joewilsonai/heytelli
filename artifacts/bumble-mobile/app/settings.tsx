import { Feather } from "@expo/vector-icons";
import Constants from "expo-constants";
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
import { FeedbackSheet } from "@/components/FeedbackSheet";
import paletteConfig, {
  APP_COLOR_SCHEME_OPTIONS,
  COLOR_THEME_OPTIONS,
  type AppColorSchemePreference,
  type ColorThemePreference,
} from "@/constants/colors";
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
  getCirclePersonCardLabel,
  type CircleCardLabelPreference,
} from "@/lib/circle-card-labels";
import {
  formatBuildChangelogVersion,
  getLatestBuildChangelog,
} from "@/lib/build-changelog";
import {
  MAX_TRUSTED_CIRCLE_PEOPLE,
  buildProfileReview,
  sanitizeCircleContact,
  type HeyTelliSettings,
  type TrustedCirclePerson,
} from "@/lib/user-settings";

const COLOR_SCHEME_ICONS: Record<
  AppColorSchemePreference,
  keyof typeof Feather.glyphMap
> = {
  system: "smartphone",
  light: "sun",
  dark: "moon",
};

export default function SettingsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { settings, setSettings, loading } = useUserSettings();
  const [draft, setDraft] = useState<HeyTelliSettings>(settings);
  const [draftDirty, setDraftDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyzingProfile, setAnalyzingProfile] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualRelationship, setManualRelationship] = useState("");
  const latestChangelog = getLatestBuildChangelog();
  const buildVersionLabel = formatBuildChangelogVersion(
    latestChangelog,
    Constants.nativeBuildVersion,
  );

  useEffect(() => {
    if (draftDirty) return;
    setDraft(settings);
  }, [draftDirty, settings]);

  const review = useMemo(
    () => buildProfileReview(draft.datingProfile),
    [draft.datingProfile],
  );
  const profileReady = Boolean(
    draft.datingProfile.profileText.trim() ||
    draft.datingProfile.profileScreenshotUris.length > 0,
  );
  const dateDefaultsReady = Boolean(
    draft.dateSafetyDefaults.transportPlan.trim() ||
    draft.dateSafetyDefaults.codeWord.trim() ||
    draft.dateSafetyDefaults.circleNote.trim(),
  );
  const osTiles = [
    {
      label: "Profile radar",
      value: profileReady ? "Ready" : "Add profile",
      icon: "shield" as const,
      bg: profileReady ? c.successBg : c.warningBg,
      fg: profileReady ? c.success : c.warning,
    },
    {
      label: "Circle seats",
      value: `${draft.trustedCircle.length}/${MAX_TRUSTED_CIRCLE_PEOPLE}`,
      icon: "users" as const,
      bg: draft.trustedCircle.length > 0 ? c.secondary : c.warningBg,
      fg: draft.trustedCircle.length > 0 ? c.secondaryForeground : c.warning,
    },
    {
      label: "Date defaults",
      value: dateDefaultsReady ? "Set" : "Add exit plan",
      icon: "calendar" as const,
      bg: dateDefaultsReady ? c.accent : c.muted,
      fg: dateDefaultsReady ? c.accentForeground : c.mutedForeground,
    },
  ];

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

  const updateAppearance = (next: Partial<HeyTelliSettings["appearance"]>) => {
    setDraft((current) => ({
      ...current,
      appearance: {
        ...current.appearance,
        ...next,
      },
    }));
    void setSettings((current) => ({
      ...current,
      appearance: {
        ...current.appearance,
        ...next,
      },
    })).catch((error: any) => {
      Alert.alert("Couldn't save appearance", error?.message ?? "Try again.");
    });
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
    if (draft.trustedCircle.length >= MAX_TRUSTED_CIRCLE_PEOPLE) {
      Alert.alert(
        "Circle full",
        `You can keep up to ${MAX_TRUSTED_CIRCLE_PEOPLE} people in your circle.`,
      );
      return;
    }
    setDraftDirty(true);
    setDraft((current) => {
      const nextCircle = [...current.trustedCircle, person].slice(
        0,
        MAX_TRUSTED_CIRCLE_PEOPLE,
      );
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
        { source: "manual" },
      ),
    );
    setManualName("");
    setManualRelationship("");
  };

  const addFromContacts = async () => {
    const result = await pickTrustedCircleContact();
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

  const updateCirclePerson = (
    id: string,
    next: Partial<
      Pick<TrustedCirclePerson, "relationship" | "cardLabelPreference">
    >,
  ) => {
    setDraftDirty(true);
    setDraft((current) => ({
      ...current,
      trustedCircle: current.trustedCircle.map((person) =>
        person.id === id
          ? {
              ...person,
              ...next,
              relationship:
                next.relationship === undefined
                  ? person.relationship
                  : next.relationship?.trim() || null,
            }
          : person,
      ),
    }));
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
          : analysis.skippedOversizedScreenshotUris.length > 0
            ? `HeyTelli filled your profile fields. ${analysis.skippedOversizedScreenshotUris.length} screenshot${analysis.skippedOversizedScreenshotUris.length === 1 ? " was" : "s were"} too large to include; crop tighter and add again if something is missing.`
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
        options={{ title: "My HeyTelli", headerTintColor: c.foreground }}
      />
      <View style={{ gap: 4 }}>
        <H1>My HeyTelli</H1>
        <Body muted>
          Your profile radar, trusted circle, and date defaults stay private on
          this phone.
        </Body>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {osTiles.map((tile) => (
          <OsStatusTile key={tile.label} {...tile} />
        ))}
      </View>

      <Card>
        <SectionLabel>Appearance</SectionLabel>
        <H2 style={{ fontSize: 18 }}>Light mode</H2>
        <Body muted style={{ marginTop: 4 }}>
          Choose a color mode and palette for the app.
        </Body>
        <View style={{ gap: 12, marginTop: 12 }}>
          <AppearanceModePicker
            value={draft.appearance.colorScheme}
            onChange={(colorScheme) => updateAppearance({ colorScheme })}
          />
          <ColorThemePicker
            value={draft.appearance.colorTheme}
            onChange={(colorTheme) => updateAppearance({ colorTheme })}
          />
        </View>
      </Card>

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
          HeyTelli stores up to 3 first names locally for Date Cards. Contact
          access is only used when you tap Add from Contacts.
        </Body>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <Button
            label="Add from Contacts"
            icon="user-plus"
            onPress={addFromContacts}
            disabled={draft.trustedCircle.length >= MAX_TRUSTED_CIRCLE_PEOPLE}
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
            disabled={draft.trustedCircle.length >= MAX_TRUSTED_CIRCLE_PEOPLE}
          />
        </View>
        <View style={{ gap: 8, marginTop: 12 }}>
          <Body muted style={{ fontSize: 12 }}>
            {draft.trustedCircle.length}/{MAX_TRUSTED_CIRCLE_PEOPLE} circle
            people
          </Body>
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
                onRelationshipChange={(relationship) =>
                  updateCirclePerson(person.id, { relationship })
                }
                onLabelPreferenceChange={(cardLabelPreference) =>
                  updateCirclePerson(person.id, { cardLabelPreference })
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
        </View>
      </Card>

      <Card>
        <SectionLabel>Beta feedback</SectionLabel>
        <H2 style={{ fontSize: 18 }}>Help shape HeyTelli</H2>
        <Body muted style={{ marginTop: 4 }}>
          Send a note about what felt wrong, missing, or surprisingly helpful.
        </Body>
        <Button
          label="Send feedback"
          icon="send"
          variant="secondary"
          onPress={() => setFeedbackOpen(true)}
          style={{ marginTop: 12 }}
        />
      </Card>

      <Card>
        <SectionLabel>Build changelog</SectionLabel>
        <H2 style={{ fontSize: 18 }}>{latestChangelog.title}</H2>
        <Body muted style={{ marginTop: 4 }}>
          {buildVersionLabel} · {latestChangelog.date}
        </Body>
        <View style={{ gap: 8, marginTop: 12 }}>
          {latestChangelog.highlights.map((highlight) => (
            <View
              key={highlight}
              style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}
            >
              <Feather name="check-circle" size={15} color={c.primary} />
              <Text style={{ flex: 1, color: c.foreground, fontSize: 13 }}>
                {highlight}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      <Button
        label={loading ? "Loading" : "Save Settings"}
        icon="save"
        onPress={save}
        loading={saving || loading}
      />
      <FeedbackSheet
        visible={feedbackOpen}
        surface="settings"
        onClose={() => setFeedbackOpen(false)}
      />
    </ScrollView>
  );
}

function clampMinutes(value: string, min: number, max: number): number {
  const parsed = Number.parseInt(value.replace(/\D/g, ""), 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

function OsStatusTile({
  label,
  value,
  icon,
  bg,
  fg,
}: {
  label: string;
  value: string;
  icon: keyof typeof Feather.glyphMap;
  bg: string;
  fg: string;
}) {
  const c = useColors();
  return (
    <View
      style={{
        flex: 1,
        minHeight: 86,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.card,
        padding: 11,
        gap: 8,
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather name={icon} size={14} color={fg} />
      </View>
      <View style={{ gap: 2 }}>
        <Text
          style={{
            color: c.mutedForeground,
            fontSize: 10,
            fontWeight: "700",
            textTransform: "uppercase",
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
        <Text
          style={{
            color: c.foreground,
            fontSize: 13,
            fontWeight: "700",
          }}
          numberOfLines={2}
        >
          {value}
        </Text>
      </View>
    </View>
  );
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
          fontWeight: "700",
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

function AppearanceModePicker({
  value,
  onChange,
}: {
  value: AppColorSchemePreference;
  onChange: (next: AppColorSchemePreference) => void;
}) {
  const c = useColors();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: c.foreground, fontSize: 14, fontWeight: "700" }}>
        Light mode
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {APP_COLOR_SCHEME_OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityLabel={`${option.label} mode`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onChange(option.value);
              }}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 58,
                borderWidth: 1,
                borderColor: selected ? c.primary : c.border,
                borderRadius: 12,
                backgroundColor: selected ? c.secondary : c.background,
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Feather
                name={COLOR_SCHEME_ICONS[option.value]}
                size={16}
                color={selected ? c.primary : c.mutedForeground}
              />
              <Text
                style={{
                  color: selected ? c.foreground : c.mutedForeground,
                  fontSize: 12,
                  fontWeight: "700",
                }}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ColorThemePicker({
  value,
  onChange,
}: {
  value: ColorThemePreference;
  onChange: (next: ColorThemePreference) => void;
}) {
  const c = useColors();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: c.foreground, fontSize: 14, fontWeight: "700" }}>
        Color theme
      </Text>
      <View style={{ gap: 8 }}>
        {COLOR_THEME_OPTIONS.map((option) => {
          const selected = value === option.value;
          const theme = paletteConfig.themes[option.value];
          return (
            <Pressable
              key={option.value}
              accessibilityLabel={`${option.label} color theme`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onChange(option.value);
              }}
              style={({ pressed }) => ({
                minHeight: 54,
                borderWidth: 1,
                borderColor: selected ? c.primary : c.border,
                borderRadius: 12,
                backgroundColor: selected ? c.secondary : c.background,
                paddingHorizontal: 12,
                paddingVertical: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <View
                style={{
                  width: 46,
                  height: 28,
                  borderRadius: 8,
                  overflow: "hidden",
                  flexDirection: "row",
                  borderWidth: 1,
                  borderColor: c.border,
                }}
              >
                <View
                  style={{ flex: 1, backgroundColor: theme.light.primary }}
                />
                <View
                  style={{ flex: 1, backgroundColor: theme.light.accent }}
                />
                <View
                  style={{ flex: 1, backgroundColor: theme.dark.background }}
                />
              </View>
              <Text
                style={{
                  flex: 1,
                  color: selected ? c.foreground : c.mutedForeground,
                  fontSize: 14,
                  fontWeight: "700",
                }}
              >
                {option.label}
              </Text>
              {selected ? (
                <Feather name="check" size={17} color={c.primary} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function CirclePersonRow({
  person,
  selected,
  onSelect,
  onRelationshipChange,
  onLabelPreferenceChange,
  onRemove,
}: {
  person: TrustedCirclePerson;
  selected: boolean;
  onSelect: () => void;
  onRelationshipChange: (relationship: string) => void;
  onLabelPreferenceChange: (preference: CircleCardLabelPreference) => void;
  onRemove: () => void;
}) {
  const c = useColors();
  const cardLabel = getCirclePersonCardLabel(person);
  const preference = person.cardLabelPreference ?? "name";
  const canUseRelationship = Boolean(person.relationship?.trim());
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
              fontWeight: "700",
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
              fontWeight: "700",
            }}
          >
            {person.name}
          </Text>
          <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
            {person.relationship ?? "Circle person"} · {person.source}
          </Text>
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Input
          placeholder="Relationship, e.g. sister, roommate"
          value={person.relationship ?? ""}
          onChangeText={onRelationshipChange}
        />
        <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
          Listed on cards as {cardLabel}
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button
            label="First name"
            icon={preference === "name" ? "check" : "user"}
            onPress={() => onLabelPreferenceChange("name")}
            variant={preference === "name" ? "secondary" : "ghost"}
            small
            style={{ flex: 1 }}
          />
          <Button
            label="Relationship"
            icon={preference === "relationship" ? "check" : "heart"}
            onPress={() => onLabelPreferenceChange("relationship")}
            variant={preference === "relationship" ? "secondary" : "ghost"}
            disabled={!canUseRelationship}
            small
            style={{ flex: 1 }}
          />
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
            fontWeight: "600",
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
          fontWeight: "400",
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
