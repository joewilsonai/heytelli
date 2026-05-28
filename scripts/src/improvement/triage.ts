import { pathToFileURL } from "node:url";
import { eq } from "drizzle-orm";
import type {
  ImprovementPrivacyRisk,
  ImprovementSignalStatus,
} from "@workspace/db";
import {
  buildGithubIssueDraft,
  buildImprovementWorkItemDraft,
  sanitizeImprovementPayload,
  type GithubIssueDraft,
  type ImprovementWorkItemDraft,
} from "@workspace/api-server/src/lib/improvementPipeline";
import { buildImprovementDigest, type ImprovementDigestCounts } from "./digest";
import { createGitHubIssue, githubTokenFromEnv } from "./github";

export type TriageSignal = {
  id: number;
  fingerprint: string;
  rawPayload: Record<string, unknown>;
  sanitizedSummary: string | null;
  sanitizedPayload: Record<string, unknown> | null;
  privacyRisk: ImprovementPrivacyRisk;
};

export type PlannedSignalTriage = {
  signalId: number;
  fingerprint: string;
  signalStatus: ImprovementSignalStatus;
  workItem: ImprovementWorkItemDraft;
  issueDraft: GithubIssueDraft | null;
  skippedIssueReason: string | null;
};

export type MergeableWorkItem = {
  frequencyCount: number;
  signalIds: number[];
};

export type TriageOptions = {
  dryRun: boolean;
  createGithubIssues: boolean;
  limit: number;
  owner: string;
  repo: string;
  githubApiUrl?: string;
  token: string | null;
  agentName: string;
};

const DEFAULT_LIMIT = 25;

function envFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parseArgs(argv: string[], env = process.env): TriageOptions {
  const dryRun =
    argv.includes("--live") || argv.includes("--no-dry-run")
      ? false
      : argv.includes("--dry-run")
        ? true
        : envFlag(env.IMPROVEMENT_WORKER_DRY_RUN, true);
  return {
    dryRun,
    createGithubIssues: envFlag(env.IMPROVEMENT_CREATE_GITHUB_ISSUES, false),
    limit: Number.parseInt(env.IMPROVEMENT_TRIAGE_LIMIT ?? "", 10) || DEFAULT_LIMIT,
    owner: env.GITHUB_OWNER || "joewilsonai",
    repo: env.GITHUB_REPO || "heytelli",
    githubApiUrl: env.GITHUB_API_URL,
    token: githubTokenFromEnv(env),
    agentName: env.IMPROVEMENT_AGENT_NAME || "heytelli-triage-worker",
  };
}

export function mergeDuplicateWorkItem<T extends MergeableWorkItem>(
  workItem: T,
  signalId: number,
): T {
  const signalIds = workItem.signalIds.includes(signalId)
    ? workItem.signalIds
    : [...workItem.signalIds, signalId];
  return {
    ...workItem,
    signalIds,
    frequencyCount: workItem.frequencyCount + 1,
  };
}

export function shouldCreateGithubIssue(plan: PlannedSignalTriage): boolean {
  return plan.issueDraft != null && plan.workItem.riskTier !== "no_auto_merge";
}

export function planSignalTriage(signal: TriageSignal): PlannedSignalTriage {
  const sanitized = sanitizeImprovementPayload(signal.rawPayload);
  const privacyRisk =
    signal.privacyRisk === "blocked" ? "blocked" : sanitized.privacyRisk;
  const sanitizedSummary = signal.sanitizedSummary ?? sanitized.summary;
  const sanitizedPayload = signal.sanitizedPayload ?? sanitized.sanitizedPayload;
  const workItem = buildImprovementWorkItemDraft({
    signalId: signal.id,
    sanitizedSummary,
    sanitizedPayload,
    privacyRisk,
    fingerprint: signal.fingerprint,
  });
  const blocked = privacyRisk === "blocked" || workItem.riskTier === "no_auto_merge";
  const issueDraft = blocked
    ? null
    : buildGithubIssueDraft({
        ...workItem,
        sanitizedPayload,
      });

  return {
    signalId: signal.id,
    fingerprint: signal.fingerprint,
    signalStatus: blocked ? "blocked" : "triaged",
    workItem: blocked
      ? {
          ...workItem,
          riskTier: "no_auto_merge",
        }
      : workItem,
    issueDraft,
    skippedIssueReason: blocked ? "privacy-risk-blocked" : null,
  };
}

export async function runImprovementTriage(
  options: TriageOptions,
): Promise<ImprovementDigestCounts> {
  if (!process.env.DATABASE_URL) {
    return {
      read: 0,
      workItemsCreated: 0,
      duplicatesGrouped: 0,
      issuesCreated: 0,
      blocked: 0,
      waitingForSignal: 0,
      dryRun: options.dryRun,
      rolledBack: 0,
    };
  }

  const { db, improvementRuns, improvementSignals, improvementWorkItems } =
    await import("@workspace/db");

  const signals = await db
    .select()
    .from(improvementSignals)
    .where(eq(improvementSignals.status, "new"))
    .limit(options.limit);
  const counts: ImprovementDigestCounts = {
    read: signals.length,
    workItemsCreated: 0,
    duplicatesGrouped: 0,
    issuesCreated: 0,
    blocked: 0,
    waitingForSignal: 0,
    dryRun: options.dryRun,
    rolledBack: 0,
  };

  const grouped = new Map<string, PlannedSignalTriage>();
  for (const signal of signals) {
    const plan = planSignalTriage({
      id: signal.id,
      fingerprint: signal.fingerprint,
      rawPayload: signal.rawPayload,
      sanitizedSummary: signal.sanitizedSummary,
      sanitizedPayload: signal.sanitizedPayload,
      privacyRisk: signal.privacyRisk,
    });
    const existing = grouped.get(plan.fingerprint);
    if (existing) {
      existing.workItem = mergeDuplicateWorkItem(
        existing.workItem,
        plan.signalId,
      );
      counts.duplicatesGrouped += 1;
      continue;
    }
    grouped.set(plan.fingerprint, plan);
  }

  for (const plan of grouped.values()) {
    if (plan.signalStatus === "blocked") {
      counts.blocked += plan.workItem.frequencyCount;
    }
    if (options.dryRun) {
      counts.workItemsCreated += 1;
      continue;
    }

    const [created] = await db
      .insert(improvementWorkItems)
      .values(plan.workItem)
      .returning();
    counts.workItemsCreated += 1;

    for (const signalId of plan.workItem.signalIds) {
      await db
        .update(improvementSignals)
        .set({
          status: plan.signalStatus,
          updatedAt: new Date(),
        })
        .where(eq(improvementSignals.id, signalId));
    }

    if (
      created &&
      options.createGithubIssues &&
      shouldCreateGithubIssue(plan) &&
      plan.issueDraft
    ) {
      const issue = await createGitHubIssue({
        owner: options.owner,
        repo: options.repo,
        token: options.token,
        draft: plan.issueDraft,
        dryRun: options.dryRun,
        apiUrl: options.githubApiUrl,
      });
      if (issue.mode === "live") {
        await db
          .update(improvementWorkItems)
          .set({
            githubIssueUrl: issue.url,
            githubIssueNumber: issue.number,
            status: "issue_created",
            updatedAt: new Date(),
          })
          .where(eq(improvementWorkItems.id, created.id));
        counts.issuesCreated += 1;
      }
    }

    if (created) {
      await db.insert(improvementRuns).values({
        workItemId: created.id,
        runType: "triage",
        agentName: options.agentName,
        status: "succeeded",
        summary: plan.skippedIssueReason ?? "Signal triaged",
        metadata: {
          dryRun: options.dryRun,
          createGithubIssues: options.createGithubIssues,
          signalIds: plan.workItem.signalIds,
        },
        completedAt: new Date(),
      });
    }
  }

  return counts;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const counts = await runImprovementTriage(options);
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL missing; no improvement signals were triaged.");
  }
  console.log(buildImprovementDigest(counts));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
