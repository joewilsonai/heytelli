import { pathToFileURL } from "node:url";
import type {
  ImprovementDecisionCategory,
  ImprovementWorkItemStatus,
} from "@workspace/db";
import {
  buildImprovementWorkItemDraft,
  fingerprintImprovementSignal,
  normalizeImprovementSignalInput,
  reconsiderThresholdForDecision,
  sanitizeImprovementPayload,
  type ImprovementSignalInput,
} from "@workspace/api-server/src/lib/improvementPipeline";

export type DemoSeedOutcome =
  | "already_available"
  | "not_planned"
  | "needs_more_signal"
  | "actionable";

export type DemoSeedScenario = {
  key: string;
  outcome: DemoSeedOutcome;
  input: ImprovementSignalInput;
  status: ImprovementWorkItemStatus;
  decisionCategory: ImprovementDecisionCategory | null;
  decisionDetails: string | null;
  frequencyCount: number;
};

export type PlannedDemoSeedScenario = {
  key: string;
  outcome: DemoSeedOutcome;
  sanitizedSummary: string;
  sanitizedPayload: Record<string, unknown>;
  fingerprint: string;
  workItem: Omit<ReturnType<typeof buildImprovementWorkItemDraft>, "status"> & {
    status: ImprovementWorkItemStatus;
    decisionCategory: ImprovementDecisionCategory | null;
    decisionDetails: string | null;
    decisionReconsiderAfterCount: number;
  };
};

const DEMO_SEED_SCENARIOS: DemoSeedScenario[] = [
  {
    key: "theme-colors-existing",
    outcome: "already_available",
    input: {
      source: "in_app_feedback",
      type: "Idea",
      message: "Can you give me more theme color options?",
      surface: "settings",
      technicalContextConsent: false,
    },
    status: "closed",
    decisionCategory: "already_available",
    decisionDetails:
      "Theme colors already include HeyTelli, Rose, Ocean, Sage, Plum, and Sunset.",
    frequencyCount: 1,
  },
  {
    key: "desktop-admin-out-of-scope",
    outcome: "not_planned",
    input: {
      source: "in_app_feedback",
      type: "Idea",
      message: "Please add a desktop-only admin builder for beta testers.",
      surface: "settings",
      technicalContextConsent: false,
    },
    status: "closed",
    decisionCategory: "not_planned",
    decisionDetails: "Desktop-only admin tooling is outside the mobile beta scope.",
    frequencyCount: 2,
  },
  {
    key: "calendar-more-signal",
    outcome: "needs_more_signal",
    input: {
      source: "in_app_feedback",
      type: "Idea",
      message: "I want a shared calendar reminder before every date.",
      surface: "date-card",
      technicalContextConsent: false,
    },
    status: "closed",
    decisionCategory: "needs_more_signal",
    decisionDetails:
      "This is tracked, but needs more beta demand before agent implementation.",
    frequencyCount: 4,
  },
  {
    key: "empty-state-actionable",
    outcome: "actionable",
    input: {
      source: "in_app_feedback",
      type: "Confusing",
      message: "The home screen feels empty before I add my first match.",
      surface: "home",
      technicalContextConsent: true,
      clientContext: { platform: "ios", buildNumber: "demo" },
    },
    status: "planned",
    decisionCategory: null,
    decisionDetails: null,
    frequencyCount: 3,
  },
];

export function buildDemoSeedPlan(): PlannedDemoSeedScenario[] {
  return DEMO_SEED_SCENARIOS.map((scenario, index) => {
    const normalized = normalizeImprovementSignalInput(scenario.input);
    if (!normalized) {
      throw new Error(`Invalid demo seed scenario: ${scenario.key}`);
    }
    const sanitized = sanitizeImprovementPayload(normalized.rawPayload);
    const fingerprint = fingerprintImprovementSignal(normalized);
    const draft = buildImprovementWorkItemDraft({
      signalId: -(index + 1),
      sanitizedSummary: sanitized.summary,
      sanitizedPayload: sanitized.sanitizedPayload,
      privacyRisk: sanitized.privacyRisk,
      fingerprint,
    });
    const decisionReconsiderAfterCount = scenario.decisionCategory
      ? reconsiderThresholdForDecision(scenario.decisionCategory)
      : 5;
    return {
      key: scenario.key,
      outcome: scenario.outcome,
      sanitizedSummary: sanitized.summary,
      sanitizedPayload: sanitized.sanitizedPayload,
      fingerprint,
      workItem: {
        ...draft,
        frequencyCount: scenario.frequencyCount,
        status: scenario.status,
        decisionCategory: scenario.decisionCategory,
        decisionDetails: scenario.decisionDetails,
        decisionReconsiderAfterCount,
      },
    };
  });
}

export function buildDemoSeedDigest(input: {
  dryRun: boolean;
  planned: PlannedDemoSeedScenario[];
}): string {
  return [
    "# HeyTelli Feedback Factory Demo Seed",
    "",
    `Mode: ${input.dryRun ? "dry run" : "live"}`,
    `Synthetic scenarios: ${input.planned.length}`,
    "",
    ...input.planned.map(
      (item) =>
        `- ${item.outcome}: ${item.sanitizedSummary} (${item.workItem.status})`,
    ),
  ].join("\n");
}

function argValue(argv: string[], flag: string): string | null {
  const eqPrefix = `${flag}=`;
  const withEquals = argv.find((arg) => arg.startsWith(eqPrefix));
  if (withEquals) return withEquals.slice(eqPrefix.length);
  const index = argv.indexOf(flag);
  return index >= 0 ? (argv[index + 1] ?? null) : null;
}

function parseDryRun(argv: string[]): boolean {
  if (argv.includes("--live") || argv.includes("--no-dry-run")) return false;
  if (argv.includes("--dry-run")) return true;
  return true;
}

export async function runDemoSeed(input: {
  dryRun: boolean;
  userId?: number | null;
}): Promise<PlannedDemoSeedScenario[]> {
  const planned = buildDemoSeedPlan();
  if (input.dryRun || !process.env.DATABASE_URL) return planned;

  const { db, improvementSignals, improvementWorkItems } = await import(
    "@workspace/db"
  );
  for (const scenario of planned) {
    const [signal] = await db
      .insert(improvementSignals)
      .values({
        userId: input.userId ?? null,
        source: "in_app_feedback",
        severity: "low",
        rawPayload: scenario.sanitizedPayload,
        sanitizedSummary: scenario.sanitizedSummary,
        sanitizedPayload: scenario.sanitizedPayload,
        privacyRisk: "low",
        fingerprint: scenario.fingerprint,
        status: scenario.workItem.status === "planned" ? "triaged" : "resolved",
      })
      .returning({ id: improvementSignals.id });
    if (!signal) continue;
    await db.insert(improvementWorkItems).values({
      ...scenario.workItem,
      signalIds: [signal.id],
      fingerprint: `${scenario.fingerprint}:demo:${Date.now()}`,
    });
  }
  return planned;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dryRun = parseDryRun(argv);
  const userIdValue = argValue(argv, "--user-id");
  const parsedUserId = userIdValue ? Number.parseInt(userIdValue, 10) : NaN;
  const userId =
    Number.isInteger(parsedUserId) && parsedUserId > 0 ? parsedUserId : null;
  const planned = await runDemoSeed({
    dryRun,
    userId,
  });
  console.log(buildDemoSeedDigest({ dryRun, planned }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
