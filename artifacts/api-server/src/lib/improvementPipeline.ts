import { createHash } from "node:crypto";
import type {
  ImprovementCategory,
  ImprovementPriority,
  ImprovementPrivacyRisk,
  ImprovementRiskTier,
  ImprovementSeverity,
  ImprovementSignalSource,
} from "@workspace/db";

export type ImprovementFeedbackType =
  | "Bug"
  | "Confusing"
  | "Idea"
  | "Safety concern"
  | "Love this";

export type ImprovementSignalInput = {
  source?: unknown;
  type?: unknown;
  message?: unknown;
  matchId?: unknown;
  surface?: unknown;
  clientContext?: unknown;
  technicalContextConsent?: unknown;
};

export type NormalizedImprovementSignal = {
  source: ImprovementSignalSource;
  type: ImprovementFeedbackType;
  message: string;
  matchId: number | null;
  surface: string | null;
  technicalContextConsent: boolean;
  rawPayload: Record<string, unknown>;
};

export type SanitizedImprovementPayload = {
  summary: string;
  sanitizedPayload: Record<string, unknown>;
  privacyRisk: ImprovementPrivacyRisk;
  severity: ImprovementSeverity;
};

export type ImprovementWorkItemDraft = {
  fingerprint: string;
  title: string;
  summary: string;
  category: ImprovementCategory;
  priority: ImprovementPriority;
  riskTier: ImprovementRiskTier;
  impactScore: number;
  confidenceScore: number;
  frequencyCount: number;
  signalIds: number[];
  status: "draft";
};

export type GithubIssueDraft = {
  title: string;
  body: string;
  labels: string[];
};

const SOURCES = new Set<ImprovementSignalSource>([
  "in_app_feedback",
  "client_error",
  "api_error",
  "analysis_failure",
  "auth_failure",
  "share_failure",
  "analytics",
  "crash",
  "system_monitor",
]);

const FEEDBACK_TYPES: ImprovementFeedbackType[] = [
  "Bug",
  "Confusing",
  "Idea",
  "Safety concern",
  "Love this",
];

const CLIENT_CONTEXT_KEYS = [
  "platform",
  "buildNumber",
  "appVersion",
  "route",
  "method",
  "status",
  "errorCode",
] as const;

const FORBIDDEN_KEY_PARTS = [
  "screenshot",
  "transcript",
  "rawconversation",
  "rawconversationtext",
  "imagedata",
  "image",
  "dataurl",
  "attachment",
  "thumbnail",
  "objectpath",
  "objecturl",
  "auth",
  "token",
];

const MAX_MESSAGE_LENGTH = 1200;
const MAX_SURFACE_LENGTH = 80;
const MAX_CONTEXT_LENGTH = 120;
const MAX_CLIENT_CONTEXT_KEYS = 12;
const MAX_CLIENT_CONTEXT_RAW_VALUE_LENGTH = 500;

const DATA_IMAGE_RE = /data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const ADDRESS_RE =
  /\b\d{2,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4}\s+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|boulevard)\b/gi;
const PRIVATE_CONTENT_RE = /\b(?:screenshot|transcript|raw conversation)\b/gi;
const PLACE_RE =
  /\b(?:at|near|inside|outside|by)\s+[A-Z][A-Za-z0-9'&.-]+(?:\s+[A-Z][A-Za-z0-9'&.-]+){1,5}\b/g;
const FULL_NAME_RE = /\b([A-Z][a-z]{2,})\s+[A-Z][a-z]{2,}\b/g;
const SEXUAL_DETAIL_RE =
  /\b(?:sex|sexual|hookup|nudes?|naked|intimate|assault|rape|coerc(?:e|ed|ion)|pressured)\b/gi;
const SAFETY_DETAIL_RE =
  /\b(?:abuse|abused|abusive|drugged|stalked|threatened|violence|violent)\b/gi;

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function matches(regex: RegExp, value: string): boolean {
  regex.lastIndex = 0;
  return regex.test(value);
}

function normalizeFeedbackType(value: unknown): ImprovementFeedbackType | null {
  const cleaned = cleanText(value, 40)?.toLowerCase();
  if (!cleaned) return null;
  return FEEDBACK_TYPES.find((type) => type.toLowerCase() === cleaned) ?? null;
}

function normalizeSource(value: unknown): ImprovementSignalSource | null {
  const cleaned = cleanText(value, 80);
  if (!cleaned || !SOURCES.has(cleaned as ImprovementSignalSource)) {
    return null;
  }
  return cleaned as ImprovementSignalSource;
}

function cleanMatchId(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function isDateCardOrShareRecord(input: {
  source: ImprovementSignalSource;
  surface: string | null;
}): boolean {
  const surface = input.surface?.toLowerCase() ?? "";
  return (
    input.source === "share_failure" ||
    surface.includes("date-card") ||
    surface.includes("date_card") ||
    surface.includes("share")
  );
}

function cleanClientContext(
  value: unknown,
  includeTechnicalContext: boolean,
): Record<string, string> {
  if (!includeTechnicalContext || !value || typeof value !== "object") {
    return {};
  }
  const input = value as Record<string, unknown>;
  const context: Record<string, string> = {};
  for (const key of CLIENT_CONTEXT_KEYS) {
    const text = cleanText(input[key], MAX_CONTEXT_LENGTH);
    if (text) context[key] = text;
  }
  return context;
}

function clientContextIsSafe(value: unknown): boolean {
  if (!value || typeof value !== "object") return true;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_CLIENT_CONTEXT_KEYS) return false;
  for (const [key, child] of entries) {
    if (
      typeof child === "string" &&
      child.length > MAX_CLIENT_CONTEXT_RAW_VALUE_LENGTH
    ) {
      return false;
    }
    const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, "");
    if (FORBIDDEN_KEY_PARTS.some((part) => normalizedKey.includes(part))) {
      return false;
    }
    if (hasForbiddenKeyOrBlob(child)) return false;
  }
  return true;
}

function messageIsSafeForRawPayload(value: string): boolean {
  return !(
    matches(DATA_IMAGE_RE, value) ||
    matches(EMAIL_RE, value) ||
    matches(PHONE_RE, value)
  );
}

function sanitizeText(value: string): string {
  return value
    .replace(DATA_IMAGE_RE, "[image omitted]")
    .replace(EMAIL_RE, "[email]")
    .replace(PHONE_RE, "[phone]")
    .replace(ADDRESS_RE, "[address]")
    .replace(PLACE_RE, "[place]")
    .replace(FULL_NAME_RE, "$1 [last name]")
    .replace(SEXUAL_DETAIL_RE, "[sensitive detail]")
    .replace(SAFETY_DETAIL_RE, "[safety detail]")
    .replace(PRIVATE_CONTENT_RE, "[private content]")
    .trim()
    .replace(/\s+/g, " ");
}

function hasForbiddenKeyOrBlob(value: unknown): boolean {
  if (typeof value === "string") {
    return matches(DATA_IMAGE_RE, value);
  }
  if (!value || typeof value !== "object") return false;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, "");
    if (FORBIDDEN_KEY_PARTS.some((part) => normalizedKey.includes(part))) {
      return true;
    }
    if (hasForbiddenKeyOrBlob(child)) return true;
  }
  return false;
}

function severityFor(
  type: ImprovementFeedbackType,
  privacyRisk: ImprovementPrivacyRisk,
  message: string,
): ImprovementSeverity {
  if (privacyRisk === "blocked") return "high";
  if (type === "Safety concern") return "high";
  if (/crash|cannot|failed|error|blocked|auth|login/i.test(message)) {
    return "medium";
  }
  if (type === "Love this") return "info";
  return "low";
}

export function normalizeImprovementSignalInput(
  input: ImprovementSignalInput,
): NormalizedImprovementSignal | null {
  const source = normalizeSource(input.source);
  const type = normalizeFeedbackType(input.type);
  const message = cleanText(input.message, MAX_MESSAGE_LENGTH);
  if (!source || !type || !message) return null;
  if (!messageIsSafeForRawPayload(message)) return null;
  if (!clientContextIsSafe(input.clientContext)) return null;

  const surface = cleanText(input.surface, MAX_SURFACE_LENGTH);
  const technicalContextConsent = input.technicalContextConsent !== false;
  const clientContext = cleanClientContext(
    input.clientContext,
    technicalContextConsent,
  );
  const matchId = isDateCardOrShareRecord({ source, surface })
    ? null
    : cleanMatchId(input.matchId);
  const payloadMessage = sanitizeText(message) || "Feedback received.";
  const rawPayload: Record<string, unknown> = {
    source,
    type,
    message: payloadMessage,
    technicalContextConsent,
  };
  if (matchId != null) rawPayload.matchId = matchId;
  if (surface) rawPayload.surface = surface;
  if (Object.keys(clientContext).length > 0) {
    rawPayload.clientContext = clientContext;
  }

  return {
    source,
    type,
    message,
    matchId,
    surface,
    technicalContextConsent,
    rawPayload,
  };
}

export function sanitizeImprovementPayload(
  rawPayload: Record<string, unknown>,
): SanitizedImprovementPayload {
  const type = normalizeFeedbackType(rawPayload.type) ?? "Bug";
  const message = cleanText(rawPayload.message, MAX_MESSAGE_LENGTH) ?? "";
  const summary = sanitizeText(message) || "Feedback received.";
  const blocked = hasForbiddenKeyOrBlob(rawPayload);
  const privacyRisk: ImprovementPrivacyRisk = blocked
    ? "blocked"
    : type === "Safety concern"
      ? "high"
      : /privacy|location|delete|auth|login/i.test(message) ||
          summary !== message ||
          matches(SEXUAL_DETAIL_RE, message) ||
          matches(SAFETY_DETAIL_RE, message)
        ? "medium"
        : "low";

  const sanitizedPayload: Record<string, unknown> = {
    source: rawPayload.source,
    type,
    message: summary,
  };
  const surface = cleanText(rawPayload.surface, MAX_SURFACE_LENGTH);
  if (surface) sanitizedPayload.surface = surface;
  if (
    rawPayload.clientContext &&
    typeof rawPayload.clientContext === "object"
  ) {
    const context = cleanClientContext(rawPayload.clientContext, true);
    Object.assign(sanitizedPayload, context);
  }

  return {
    summary,
    sanitizedPayload,
    privacyRisk,
    severity: severityFor(type, privacyRisk, message),
  };
}

export function fingerprintImprovementSignal(
  signal: NormalizedImprovementSignal,
): string {
  const sanitized = sanitizeImprovementPayload(signal.rawPayload);
  const bucket = [
    signal.source,
    signal.type.toLowerCase(),
    signal.surface?.toLowerCase() ?? "global",
    sanitized.summary.toLowerCase().slice(0, 160),
  ].join("|");
  return createHash("sha256").update(bucket).digest("hex");
}

function categoryFor(
  type: ImprovementFeedbackType,
  summary: string,
): ImprovementCategory {
  if (type === "Safety concern") return "safety_issue";
  if (/privacy|private|leak|location|screenshot|transcript/i.test(summary)) {
    return "privacy";
  }
  if (/slow|lag|timeout|performance/i.test(summary)) return "performance";
  if (/crash|error|failed|cannot|won't|wont|broken|bug/i.test(summary)) {
    return "bug";
  }
  if (type === "Confusing") return "ux_confusion";
  if (type === "Idea") return "feature_request";
  if (type === "Love this") return "copy";
  return "bug";
}

function priorityFor(
  category: ImprovementCategory,
  privacyRisk: ImprovementPrivacyRisk,
): ImprovementPriority {
  if (privacyRisk === "blocked" || category === "privacy") return "p0";
  if (category === "safety_issue") return "p1";
  if (category === "bug" || category === "reliability") return "p2";
  return "p3";
}

function riskTierFor(
  category: ImprovementCategory,
  priority: ImprovementPriority,
  privacyRisk: ImprovementPrivacyRisk,
): ImprovementRiskTier {
  if (privacyRisk === "blocked") return "no_auto_merge";
  if (
    privacyRisk === "high" ||
    category === "safety_issue" ||
    category === "privacy" ||
    priority === "p0"
  ) {
    return "extra_agent_review";
  }
  if (category === "bug" || category === "reliability") {
    return "guarded_auto_merge";
  }
  return "safe_auto_merge";
}

export function buildImprovementWorkItemDraft(input: {
  signalId: number;
  sanitizedSummary: string;
  sanitizedPayload: Record<string, unknown>;
  privacyRisk: ImprovementPrivacyRisk;
  fingerprint: string;
}): ImprovementWorkItemDraft {
  const type = normalizeFeedbackType(input.sanitizedPayload.type) ?? "Bug";
  const category = categoryFor(type, input.sanitizedSummary);
  const priority = priorityFor(category, input.privacyRisk);
  const riskTier = riskTierFor(category, priority, input.privacyRisk);
  const surface =
    cleanText(input.sanitizedPayload.surface, MAX_SURFACE_LENGTH) ?? "app";
  const summary = input.sanitizedSummary || "Feedback received.";
  const title = `Feedback: ${surface} - ${summary}`.slice(0, 120);

  return {
    fingerprint: input.fingerprint,
    title,
    summary,
    category,
    priority,
    riskTier,
    impactScore: priority === "p0" ? 5 : priority === "p1" ? 4 : 2,
    confidenceScore: input.privacyRisk === "blocked" ? 2 : 3,
    frequencyCount: 1,
    signalIds: [input.signalId],
    status: "draft",
  };
}

export function buildGithubIssueDraft(input: {
  title: string;
  summary: string;
  category: ImprovementCategory;
  priority: ImprovementPriority;
  riskTier: ImprovementRiskTier;
  frequencyCount: number;
  signalIds: number[];
  sanitizedPayload: Record<string, unknown>;
}): GithubIssueDraft {
  const surface = cleanText(input.sanitizedPayload.surface, 120) ?? "unknown";
  const platform = cleanText(input.sanitizedPayload.platform, 80) ?? "unknown";
  const buildNumber = cleanText(input.sanitizedPayload.buildNumber, 80);
  const labels = [
    "feedback",
    input.category,
    `priority:${input.priority}`,
    `risk:${input.riskTier}`,
    "agent-ready",
  ];
  const body = [
    `## Sanitized Summary`,
    input.summary,
    ``,
    `## Source and Frequency`,
    `In-app feedback count: ${input.frequencyCount}`,
    ``,
    `## Affected Surface`,
    `Surface: ${surface}`,
    `Platform: ${platform}${buildNumber ? `, build ${buildNumber}` : ""}`,
    ``,
    `## Expected Behavior`,
    `The affected flow should feel clear, reliable, and privacy-safe.`,
    ``,
    `## Actual Behavior`,
    input.summary,
    ``,
    `## Reproduction Notes`,
    `Use sanitized product context only. Private source rows stay in the database.`,
    ``,
    `## Privacy Note`,
    `No private screenshots/transcripts included.`,
    ``,
    `## Suggested Agent Tasks`,
    `1. Inspect the affected surface and nearby tests.`,
    `2. Implement the smallest safe fix.`,
    `3. Add or update regression coverage.`,
  ].join("\n");

  return { title: input.title.slice(0, 120), body, labels };
}
