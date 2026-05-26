import { createHash } from "node:crypto";
import type {
  InsertMatchRedFlagEvent,
  MatchRedFlagEvent,
  RedFlagEventSource,
  RedFlagRadarSnapshot,
  RedFlagSeverity,
} from "@workspace/db";
import type { GreenFlag, RedFlag, RedFlagRadarResult } from "./redFlagRadar";

export type RedFlagStatus = "current" | "previously-seen";

export type RedFlagWithHistory = RedFlag & {
  status: RedFlagStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
};

export type RedFlagSummary = {
  currentCount: number;
  historicalCount: number;
  highSeverityCount: number;
  lastAnalyzedAt: string | null;
};

export type RedFlagRadarHistoryResult = RedFlagRadarResult & {
  currentRedFlags: RedFlagWithHistory[];
  historicalRedFlags: RedFlagWithHistory[];
  redFlags: RedFlagWithHistory[];
  generatedAt: string;
  redFlagSummary: RedFlagSummary;
};

export type BuiltRedFlagEventRow = InsertMatchRedFlagEvent & {
  matchId: number;
  source: RedFlagEventSource;
  runId: string;
  severity: RedFlagSeverity;
  label: string;
  evidence: string;
  fingerprint: string;
  contextHash: string;
  observedAt: Date;
};

const severityRank: Record<RedFlagSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ");
}

function normalizeSeverity(severity: unknown): RedFlagSeverity {
  return severity === "high" || severity === "medium" || severity === "low"
    ? severity
    : "medium";
}

function normalizeEvidence(evidence: unknown): string {
  return typeof evidence === "string" && evidence.trim()
    ? evidence.trim()
    : "Saved concern from analysis.";
}

export function normalizeRedFlag(flag: RedFlag): RedFlag | null {
  const label = normalizeLabel(flag.label);
  if (!label) return null;
  return {
    severity: normalizeSeverity(flag.severity),
    label,
    evidence: normalizeEvidence(flag.evidence),
  };
}

export function redFlagFingerprint(flag: Pick<RedFlag, "label">): string {
  return createHash("sha256")
    .update(normalizeLabel(flag.label).toLowerCase())
    .digest("hex");
}

export function buildRedFlagEventRows(input: {
  matchId: number;
  source: RedFlagEventSource;
  runId: string;
  contextHash: string;
  observedAt: Date;
  redFlags: RedFlag[];
}): BuiltRedFlagEventRow[] {
  const rows: BuiltRedFlagEventRow[] = [];
  for (const raw of input.redFlags) {
    const flag = normalizeRedFlag(raw);
    if (!flag) continue;
    rows.push({
      matchId: input.matchId,
      source: input.source,
      runId: input.runId,
      severity: flag.severity,
      label: flag.label,
      evidence: flag.evidence,
      fingerprint: redFlagFingerprint(flag),
      contextHash: input.contextHash,
      observedAt: input.observedAt,
    });
  }
  return rows;
}

function toIso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function strongerSeverity(
  a: RedFlagSeverity,
  b: RedFlagSeverity,
): RedFlagSeverity {
  return severityRank[a] >= severityRank[b] ? a : b;
}

export function summarizeRedFlagHistory(input: {
  events: Array<
    Pick<
      MatchRedFlagEvent,
      "severity" | "label" | "evidence" | "fingerprint" | "observedAt"
    >
  >;
  currentRedFlags: RedFlag[];
  generatedAt?: Date;
}): RedFlagRadarHistoryResult["redFlagSummary"] & {
  currentRedFlags: RedFlagWithHistory[];
  historicalRedFlags: RedFlagWithHistory[];
  redFlags: RedFlagWithHistory[];
} {
  const current = input.currentRedFlags
    .map(normalizeRedFlag)
    .filter((flag): flag is RedFlag => flag !== null);
  const currentByFingerprint = new Map(
    current.map((flag) => [redFlagFingerprint(flag), flag]),
  );
  const groups = new Map<
    string,
    {
      severity: RedFlagSeverity;
      label: string;
      evidence: string;
      firstSeenAt: string;
      lastSeenAt: string;
      occurrenceCount: number;
    }
  >();

  for (const event of input.events) {
    const observedAt = toIso(event.observedAt);
    const previous = groups.get(event.fingerprint);
    if (!previous) {
      groups.set(event.fingerprint, {
        severity: event.severity,
        label: event.label,
        evidence: event.evidence,
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
        occurrenceCount: 1,
      });
      continue;
    }
    previous.severity = strongerSeverity(previous.severity, event.severity);
    if (observedAt >= previous.lastSeenAt) {
      previous.label = event.label;
      previous.evidence = event.evidence;
      previous.lastSeenAt = observedAt;
    }
    if (observedAt < previous.firstSeenAt) previous.firstSeenAt = observedAt;
    previous.occurrenceCount += 1;
  }

  const currentRows: RedFlagWithHistory[] = [];
  const historicalRows: RedFlagWithHistory[] = [];
  const generatedAt = (input.generatedAt ?? new Date()).toISOString();
  for (const flag of current) {
    const fingerprint = redFlagFingerprint(flag);
    if (groups.has(fingerprint)) continue;
    groups.set(fingerprint, {
      severity: flag.severity,
      label: flag.label,
      evidence: flag.evidence,
      firstSeenAt: generatedAt,
      lastSeenAt: generatedAt,
      occurrenceCount: 1,
    });
  }

  for (const [fingerprint, group] of groups) {
    const currentFlag = currentByFingerprint.get(fingerprint);
    if (currentFlag) {
      currentRows.push({
        ...currentFlag,
        severity: strongerSeverity(group.severity, currentFlag.severity),
        status: "current",
        firstSeenAt: group.firstSeenAt,
        lastSeenAt: generatedAt,
        occurrenceCount: group.occurrenceCount,
      });
    } else {
      historicalRows.push({
        severity: group.severity,
        label: group.label,
        evidence: group.evidence,
        status: "previously-seen",
        firstSeenAt: group.firstSeenAt,
        lastSeenAt: group.lastSeenAt,
        occurrenceCount: group.occurrenceCount,
      });
    }
  }

  const bySeverityThenRecency = (
    a: RedFlagWithHistory,
    b: RedFlagWithHistory,
  ) =>
    severityRank[b.severity] - severityRank[a.severity] ||
    b.lastSeenAt.localeCompare(a.lastSeenAt);
  currentRows.sort(bySeverityThenRecency);
  historicalRows.sort(bySeverityThenRecency);
  const redFlags = [...currentRows, ...historicalRows];
  const latestSeenAt =
    currentRows.length > 0
      ? generatedAt
      : redFlags.reduce<string | null>(
          (latest, flag) =>
            latest == null || flag.lastSeenAt > latest
              ? flag.lastSeenAt
              : latest,
          null,
        );

  return {
    currentRedFlags: currentRows,
    historicalRedFlags: historicalRows,
    redFlags,
    currentCount: currentRows.length,
    historicalCount: historicalRows.length,
    highSeverityCount: redFlags.filter((flag) => flag.severity === "high")
      .length,
    lastAnalyzedAt: latestSeenAt,
  };
}

export function buildRedFlagSnapshot(input: {
  result: RedFlagRadarResult;
  generatedAt: Date;
  contextHash: string;
}): RedFlagRadarSnapshot {
  return {
    redFlags: input.result.redFlags
      .map(normalizeRedFlag)
      .filter((flag): flag is RedFlag => flag !== null),
    greenFlags: input.result.greenFlags
      .filter(
        (flag): flag is GreenFlag =>
          !!flag && typeof flag.label === "string" && flag.label.trim() !== "",
      )
      .map((flag) => ({
        label: flag.label.trim(),
        evidence: normalizeEvidence(flag.evidence),
      })),
    overallRead: input.result.overallRead,
    generatedAt: input.generatedAt.toISOString(),
    contextHash: input.contextHash,
  };
}
