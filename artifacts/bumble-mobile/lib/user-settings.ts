import {
  normalizeColorSchemePreference,
  normalizeColorThemePreference,
  type AppColorSchemePreference,
  type ColorThemePreference,
} from "../constants/colors.ts";
import type { DateSafetyPlan } from "./date-safety-plan.ts";
import {
  getCirclePersonCardLabel,
  normalizeCircleCardPreference,
  type CircleCardLabelPreference,
} from "./circle-card-labels.ts";

export type TrustedCircleSource = "manual" | "contacts";

export type TrustedCirclePerson = {
  id: string;
  name: string;
  relationship: string | null;
  cardLabelPreference?: CircleCardLabelPreference;
  phoneNumber: string | null;
  source: TrustedCircleSource;
  createdAt: string;
};

export type DatingProfileSettings = {
  profileText: string;
  lookingFor: string;
  boundaries: string;
  photoNotes: string;
  profileScreenshotUris: string[];
  updatedAt: string | null;
};

export type DateSafetyDefaults = {
  primaryCirclePersonId: string | null;
  transportPlan: string;
  checkInOffsetMinutes: number;
  expectedEndOffsetMinutes: number;
  codeWord: string;
  circleNote: string;
  shareLiveLocation: boolean;
  storePhone: boolean;
};

export type AppearanceSettings = {
  colorScheme: AppColorSchemePreference;
  colorTheme: ColorThemePreference;
};

export type HeyTelliSettings = {
  appearance: AppearanceSettings;
  datingProfile: DatingProfileSettings;
  trustedCircle: TrustedCirclePerson[];
  dateSafetyDefaults: DateSafetyDefaults;
};

export type PickedContact = {
  fullName: string;
  phoneNumber?: string | null;
  relationship?: string | null;
};

export type ProfileReview = {
  readyForMatching: boolean;
  strengths: string[];
  privacyWarnings: string[];
  clarityWarnings: string[];
};

export const MAX_TRUSTED_CIRCLE_PEOPLE = 3;

export const DEFAULT_HEYTELLI_SETTINGS: HeyTelliSettings = {
  appearance: {
    colorScheme: "system",
    colorTheme: "heytelli",
  },
  datingProfile: {
    profileText: "",
    lookingFor: "",
    boundaries: "",
    photoNotes: "",
    profileScreenshotUris: [],
    updatedAt: null,
  },
  trustedCircle: [],
  dateSafetyDefaults: {
    primaryCirclePersonId: null,
    transportPlan: "",
    checkInOffsetMinutes: 60,
    expectedEndOffsetMinutes: 180,
    codeWord: "",
    circleNote: "",
    shareLiveLocation: false,
    storePhone: false,
  },
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullable(value: unknown): string | null {
  const trimmed = clean(value);
  return trimmed ? trimmed : null;
}

function firstName(fullName: unknown): string {
  const trimmed = clean(fullName);
  if (!trimmed) return "Circle";
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

function minutesAfter(value: string | null | undefined, minutes: number) {
  const start = value ? new Date(value) : new Date();
  if (Number.isNaN(start.getTime())) return null;
  const date = new Date(start);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

function makeLocalId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function cleanCircleSource(value: unknown): TrustedCircleSource {
  return value === "manual" || value === "contacts" ? value : "manual";
}

function cleanTrustedCirclePerson(value: unknown): TrustedCirclePerson | null {
  if (!value || typeof value !== "object") return null;
  const person = value as Partial<TrustedCirclePerson>;
  return {
    id: clean(person.id) || makeLocalId("circle"),
    name: firstName(person.name),
    relationship: nullable(person.relationship),
    cardLabelPreference: normalizeCircleCardPreference(
      person.cardLabelPreference,
    ),
    phoneNumber: null,
    source: cleanCircleSource(person.source),
    createdAt: clean(person.createdAt) || new Date().toISOString(),
  };
}

export function sanitizeCircleContact(
  contact: PickedContact,
  options: { storePhone?: boolean; source?: TrustedCircleSource } = {},
): TrustedCirclePerson {
  return {
    id: makeLocalId("circle"),
    name: firstName(contact.fullName),
    relationship: nullable(contact.relationship),
    cardLabelPreference: "name",
    phoneNumber: null,
    source: options.source ?? "contacts",
    createdAt: new Date().toISOString(),
  };
}

export function getPrimaryCirclePerson(
  settings: HeyTelliSettings,
): TrustedCirclePerson | null {
  const selectedId = settings.dateSafetyDefaults.primaryCirclePersonId;
  return (
    settings.trustedCircle.find((person) => person.id === selectedId) ??
    settings.trustedCircle[0] ??
    null
  );
}

export function getTrustedCirclePeople(
  settings: HeyTelliSettings,
): TrustedCirclePerson[] {
  const primary = getPrimaryCirclePerson(settings);
  const people = primary
    ? [
        primary,
        ...settings.trustedCircle.filter((person) => person.id !== primary.id),
      ]
    : settings.trustedCircle;
  return people.slice(0, MAX_TRUSTED_CIRCLE_PEOPLE);
}

export function buildDateSafetyPlanFromSettings(
  settings: HeyTelliSettings,
  match: { nextDateAt?: string | null },
): DateSafetyPlan {
  const circlePeople = getTrustedCirclePeople(settings);
  const defaults = settings.dateSafetyDefaults;

  return {
    trustedCircleName:
      circlePeople
        .map((person) => getCirclePersonCardLabel(person))
        .join(", ") || null,
    transportPlan: nullable(defaults.transportPlan),
    checkInAt: minutesAfter(match.nextDateAt, defaults.checkInOffsetMinutes),
    expectedEndAt: minutesAfter(
      match.nextDateAt,
      defaults.expectedEndOffsetMinutes,
    ),
    codeWord: nullable(defaults.codeWord),
    circleNote: nullable(defaults.circleNote),
    shareLiveLocation: defaults.shareLiveLocation,
    safeDateChecklist: {
      publicPlace: false,
      ownTransport: Boolean(nullable(defaults.transportPlan)),
      circleHasPlan: false,
      profileReviewed: false,
      noPrivateLocationPressure: false,
      noMoneyOrPhotoPressure: false,
    },
    circleCheckStatus: "planned",
    lastCircleCheckAt: null,
  };
}

export function mergeSettings(
  value: Partial<HeyTelliSettings> | null | undefined,
): HeyTelliSettings {
  return stripStoredCirclePhoneNumbers({
    appearance: {
      colorScheme: normalizeColorSchemePreference(
        value?.appearance?.colorScheme,
      ),
      colorTheme: normalizeColorThemePreference(value?.appearance?.colorTheme),
    },
    datingProfile: {
      ...DEFAULT_HEYTELLI_SETTINGS.datingProfile,
      ...(value?.datingProfile ?? {}),
      profileScreenshotUris: Array.isArray(
        value?.datingProfile?.profileScreenshotUris,
      )
        ? value.datingProfile.profileScreenshotUris
        : [],
    },
    trustedCircle: Array.isArray(value?.trustedCircle)
      ? value.trustedCircle
          .slice(0, MAX_TRUSTED_CIRCLE_PEOPLE)
          .map(cleanTrustedCirclePerson)
          .filter((person): person is TrustedCirclePerson => person != null)
      : [],
    dateSafetyDefaults: {
      ...DEFAULT_HEYTELLI_SETTINGS.dateSafetyDefaults,
      ...(value?.dateSafetyDefaults ?? {}),
    },
  });
}

export function stripStoredCirclePhoneNumbers(
  settings: HeyTelliSettings,
): HeyTelliSettings {
  return {
    ...settings,
    trustedCircle: settings.trustedCircle
      .map(cleanTrustedCirclePerson)
      .filter((person): person is TrustedCirclePerson => person != null),
    dateSafetyDefaults: {
      ...settings.dateSafetyDefaults,
      storePhone: false,
    },
  };
}

export function buildProfileReview(
  profile: Pick<
    DatingProfileSettings,
    "profileText" | "lookingFor" | "boundaries" | "photoNotes"
  >,
): ProfileReview {
  const text = [
    profile.profileText,
    profile.lookingFor,
    profile.boundaries,
    profile.photoNotes,
  ]
    .join("\n")
    .toLowerCase();
  const privacyWarnings: string[] = [];
  const clarityWarnings: string[] = [];
  const strengths: string[] = [];

  if (
    /@[a-z0-9_.]+/i.test(text) ||
    /\binstagram|snapchat|tiktok\b/i.test(text)
  ) {
    privacyWarnings.push(
      "Remove social handle breadcrumbs until trust is earned.",
    );
  }
  if (/\bwork at\b|\bwork badge\b|\bemployer\b|\boffice\b/i.test(text)) {
    privacyWarnings.push("Blur workplace details, badges, and employer names.");
  }
  if (
    /\bevery\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\bmy gym\b|\byoga\b/i.test(
      text,
    )
  ) {
    privacyWarnings.push("Avoid routines that make you easy to locate.");
  }
  if (!clean(profile.lookingFor)) {
    clarityWarnings.push(
      "Say what you are looking for so matches can self-filter.",
    );
  }
  if (/\bjust seeing\b|\bwhatever happens\b|\bnot sure\b/i.test(text)) {
    clarityWarnings.push(
      "Vague intent can invite low-effort or undefined situations.",
    );
  }
  if (clean(profile.boundaries)) {
    strengths.push(
      "Clear boundary language helps filter for respectful follow-through.",
    );
  }
  if (clean(profile.lookingFor)) {
    strengths.push(
      "Clear dating intent makes compatibility easier to compare.",
    );
  }

  return {
    readyForMatching:
      privacyWarnings.length === 0 &&
      clarityWarnings.length === 0 &&
      strengths.length > 0,
    strengths,
    privacyWarnings,
    clarityWarnings,
  };
}
