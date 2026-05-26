import type { DateSafetyPlan } from "./date-safety-plan.ts";

export type TrustedCircleSource = "manual" | "contacts";

export type TrustedCirclePerson = {
  id: string;
  name: string;
  relationship: string | null;
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

export type HeyTelliSettings = {
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

export const DEFAULT_HEYTELLI_SETTINGS: HeyTelliSettings = {
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

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function nullable(value: string | null | undefined): string | null {
  const trimmed = clean(value);
  return trimmed ? trimmed : null;
}

function firstName(fullName: string): string {
  const trimmed = fullName.trim();
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

export function sanitizeCircleContact(
  contact: PickedContact,
  options: { storePhone?: boolean; source?: TrustedCircleSource } = {},
): TrustedCirclePerson {
  return {
    id: makeLocalId("circle"),
    name: firstName(contact.fullName),
    relationship: nullable(contact.relationship),
    phoneNumber: options.storePhone ? nullable(contact.phoneNumber) : null,
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

export function buildDateSafetyPlanFromSettings(
  settings: HeyTelliSettings,
  match: { nextDateAt?: string | null },
): DateSafetyPlan {
  const primary = getPrimaryCirclePerson(settings);
  const defaults = settings.dateSafetyDefaults;

  return {
    trustedCircleName: primary?.name ?? null,
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
      circleHasPlan: Boolean(primary),
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
  return {
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
      : [],
    dateSafetyDefaults: {
      ...DEFAULT_HEYTELLI_SETTINGS.dateSafetyDefaults,
      ...(value?.dateSafetyDefaults ?? {}),
    },
  };
}

export function stripStoredCirclePhoneNumbers(
  settings: HeyTelliSettings,
): HeyTelliSettings {
  return {
    ...settings,
    trustedCircle: settings.trustedCircle.map((person) => ({
      ...person,
      phoneNumber: null,
    })),
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
