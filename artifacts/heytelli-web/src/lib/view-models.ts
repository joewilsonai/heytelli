type Flag = {
  label: string;
  evidence: string;
  severity?: string;
  status?: string;
};

type TimelineEvent = {
  id: number;
  matchId?: number;
  type?: string;
  source?: string;
  title: string;
  summary: string | null;
  body: string | null;
  metadata?: unknown;
  occurredAt: string;
  createdAt?: string;
};

type TranscriptTurn = {
  speaker: string;
  text: string;
};

export interface MatchSummaryInput {
  id: number;
  name: string;
  status: string;
  overallRead?: string | null;
  readFreshness?: string;
  lastRead?: { body: string; generatedAt: string; screenshotCountAt: number } | null;
  currentRedFlags?: Flag[];
  greenFlags?: Flag[];
  redFlagSummary?: {
    currentCount: number;
    historicalCount: number;
    highSeverityCount: number;
    lastAnalyzedAt: string | null;
  };
  pendingScreenshotCount?: number;
  failedScreenshotCount?: number;
  analysisFreshness?: string;
}

export interface MatchSummaryCard {
  primaryLabel: "Calm Read";
  body: string;
  safetyLabel: string;
  freshnessLabel: string;
  statusLabel: string;
  badges: string[];
  needsAttention: boolean;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function buildMatchSummary(match: MatchSummaryInput): MatchSummaryCard {
  const currentFlags = match.currentRedFlags ?? [];
  const greenFlags = match.greenFlags ?? [];
  const pendingCount = match.pendingScreenshotCount ?? 0;
  const failedCount = match.failedScreenshotCount ?? 0;
  const highRiskCount = match.redFlagSummary?.highSeverityCount ?? 0;
  const readBody = match.lastRead?.body || match.overallRead || "Add screenshots to build a Calm Read.";

  const badges = [
    greenFlags.length > 0 ? pluralize(greenFlags.length, "green flag") : "No green flags yet",
    currentFlags.length > 0 ? pluralize(currentFlags.length, "safety note") : "No current safety flags",
  ];
  if (pendingCount > 0) badges.push(`${pluralize(pendingCount, "screenshot")} analyzing`);
  if (failedCount > 0) badges.push(`${pluralize(failedCount, "import")} needs retry`);

  return {
    primaryLabel: "Calm Read",
    body: readBody,
    safetyLabel:
      currentFlags.length === 0
        ? "No current safety flags"
        : highRiskCount > 0
          ? "High-priority safety review"
          : "Safety notes present",
    freshnessLabel:
      match.analysisFreshness === "current" || match.readFreshness === "current"
        ? "Current"
        : "Needs update",
    statusLabel: match.status === "active" ? "Active" : match.status,
    badges,
    needsAttention: currentFlags.length > 0 || pendingCount > 0 || failedCount > 0,
  };
}

export interface EvidenceInput {
  currentRedFlags?: Flag[];
  historicalRedFlags?: Flag[];
  greenFlags?: Flag[];
  timelineEvents?: TimelineEvent[];
  transcript?: TranscriptTurn[];
}

export interface EvidenceSection {
  id: "safety" | "green" | "timeline" | "transcript";
  title: string;
  count: number;
  items: Array<{ title: string; body: string; tone?: string }>;
}

export function buildEvidenceSections(input: EvidenceInput): EvidenceSection[] {
  const current = input.currentRedFlags ?? [];
  const historical = input.historicalRedFlags ?? [];
  const green = input.greenFlags ?? [];
  const timeline = input.timelineEvents ?? [];
  const transcript = input.transcript ?? [];

  return [
    {
      id: "safety",
      title: "Safety Risk",
      count: current.length + historical.length,
      items: [...current, ...historical].map((flag) => ({
        title: flag.label,
        body: flag.evidence,
        tone: flag.severity,
      })),
    },
    {
      id: "green",
      title: "Dating Clarity",
      count: green.length,
      items: green.map((flag) => ({ title: flag.label, body: flag.evidence })),
    },
    {
      id: "timeline",
      title: "Timeline",
      count: timeline.length,
      items: timeline.map((event) => ({
        title: event.title,
        body: event.summary || event.body || formatDate(event.occurredAt),
      })),
    },
    {
      id: "transcript",
      title: "Conversation",
      count: transcript.length,
      items: transcript.map((turn) => ({
        title: turn.speaker === "me" ? "You" : "Them",
        body: turn.text,
      })),
    },
  ];
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
