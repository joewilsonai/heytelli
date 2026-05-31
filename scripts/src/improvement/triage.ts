import { pathToFileURL } from "node:url";
import { eq, sql } from "drizzle-orm";
import type {
  ImprovementWorkItem,
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
  maxGithubIssuesPerRun: number;
  owner: string;
  repo: string;
  githubApiUrl?: string;
  token: string | null;
  agentName: string;
};

const DEFAULT_LIMIT = 25;
const DEFAULT_MAX_GITHUB_ISSUES_PER_RUN = 5;

function envFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function numericEnv(value: string | undefined, defaultValue: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultValue;
}

function argValue(argv: string[], flag: string): string | null {
  const eqPrefix = `${flag}=`;
  const withEquals = argv.find((arg) => arg.startsWith(eqPrefix));
  if (withEquals) return withEquals.slice(eqPrefix.length);
  const index = argv.indexOf(flag);
  if (index >= 0) return argv[index + 1] ?? null;
  return null;
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
    maxGithubIssuesPerRun: numericEnv(
      argValue(argv, "--max-github-issues-per-run") ??
        env.IMPROVEMENT_MAX_GITHUB_ISSUES_PER_RUN,
      DEFAULT_MAX_GITHUB_ISSUES_PER_RUN,
    ),
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
  if (workItem.signalIds.includes(signalId)) {
    return workItem;
  }
  const signalIds = [...workItem.signalIds, signalId];
  return {
    ...workItem,
    signalIds,
    frequencyCount: workItem.frequencyCount + 1,
  };
}

export function mergeWorkItemSignals<T extends MergeableWorkItem>(
  workItem: T,
  signalIds: number[],
): T {
  return signalIds.reduce(
    (current, signalId) => mergeDuplicateWorkItem(current, signalId),
    workItem,
  );
}

export function shouldCreateGithubIssue(plan: PlannedSignalTriage): boolean {
  return plan.issueDraft != null && plan.workItem.riskTier !== "no_auto_merge";
}

export function githubIssueRunDecision(input: {
  candidateIssue: boolean;
  openedThisRun: number;
  maxGithubIssuesPerRun: number;
}): "not-needed" | "open" | "defer-run-cap" {
  if (!input.candidateIssue) return "not-needed";
  return input.openedThisRun < input.maxGithubIssuesPerRun
    ? "open"
    : "defer-run-cap";
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

  async function loadWorkItemByFingerprint(
    fingerprint: string,
  ): Promise<ImprovementWorkItem | null> {
    const [existing] = await db
      .select()
      .from(improvementWorkItems)
      .where(eq(improvementWorkItems.fingerprint, fingerprint))
      .limit(1);
    return existing ?? null;
  }

  async function saveWorkItem(
    plan: PlannedSignalTriage,
  ): Promise<{ workItem: ImprovementWorkItem; created: boolean }> {
    async function mergeSignalIds(
      workItemId: number,
      signalIds: number[],
    ): Promise<ImprovementWorkItem> {
      const signalIdsJson = JSON.stringify(signalIds);
      const [updated] = await db
        .update(improvementWorkItems)
        .set({
          signalIds: sql`(
            SELECT COALESCE(jsonb_agg(DISTINCT items.value::int), '[]'::jsonb)
            FROM jsonb_array_elements_text(${improvementWorkItems.signalIds} || ${signalIdsJson}::jsonb) AS items(value)
          )`,
          frequencyCount: sql`(
            SELECT count(DISTINCT items.value::int)::int
            FROM jsonb_array_elements_text(${improvementWorkItems.signalIds} || ${signalIdsJson}::jsonb) AS items(value)
          )`,
          updatedAt: new Date(),
        })
        .where(eq(improvementWorkItems.id, workItemId))
        .returning();
      if (!updated) {
        throw new Error("Improvement work item merge returned no row");
      }
      return updated;
    }

    const existing = await loadWorkItemByFingerprint(plan.fingerprint);
    if (existing) {
      const updated = await mergeSignalIds(existing.id, plan.workItem.signalIds);
      return { workItem: updated, created: false };
    }

    try {
      const [created] = await db
        .insert(improvementWorkItems)
        .values(plan.workItem)
        .returning();
      if (!created) {
        throw new Error("Improvement work item insert returned no row");
      }
      return { workItem: created, created: true };
    } catch (err) {
      const raced = await loadWorkItemByFingerprint(plan.fingerprint);
      if (!raced) throw err;
      const updated = await mergeSignalIds(raced.id, plan.workItem.signalIds);
      return { workItem: updated, created: false };
    }
  }

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
  let githubIssuesOpenedThisRun = 0;
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
      const existing = await loadWorkItemByFingerprint(plan.fingerprint);
      if (existing) {
        counts.duplicatesGrouped += 1;
      } else {
        counts.workItemsCreated += 1;
      }
      if (
        githubIssueRunDecision({
          candidateIssue:
            options.createGithubIssues &&
            shouldCreateGithubIssue(plan) &&
            existing?.githubIssueUrl == null,
          openedThisRun: githubIssuesOpenedThisRun,
          maxGithubIssuesPerRun: options.maxGithubIssuesPerRun,
        }) === "open"
      ) {
        counts.issuesCreated += 1;
        githubIssuesOpenedThisRun += 1;
      } else if (
        githubIssueRunDecision({
          candidateIssue:
            options.createGithubIssues &&
            shouldCreateGithubIssue(plan) &&
            existing?.githubIssueUrl == null,
          openedThisRun: githubIssuesOpenedThisRun,
          maxGithubIssuesPerRun: options.maxGithubIssuesPerRun,
        }) === "defer-run-cap"
      ) {
        counts.issueCapDeferred =
          (counts.issueCapDeferred ?? 0) + plan.workItem.frequencyCount;
      }
      continue;
    }

    const existingForIssueCap = await loadWorkItemByFingerprint(
      plan.fingerprint,
    );
    const issueRunDecision = githubIssueRunDecision({
      candidateIssue:
        options.createGithubIssues &&
        shouldCreateGithubIssue(plan) &&
        existingForIssueCap?.githubIssueUrl == null,
      openedThisRun: githubIssuesOpenedThisRun,
      maxGithubIssuesPerRun: options.maxGithubIssuesPerRun,
    });
    if (issueRunDecision === "defer-run-cap") {
      counts.issueCapDeferred =
        (counts.issueCapDeferred ?? 0) + plan.workItem.frequencyCount;
      continue;
    }

    const saved = await saveWorkItem(plan);
    const workItem = saved.workItem;
    if (saved.created) {
      counts.workItemsCreated += 1;
    } else {
      counts.duplicatesGrouped += 1;
    }

    const shouldOpenIssue =
      options.createGithubIssues &&
      shouldCreateGithubIssue(plan) &&
      plan.issueDraft &&
      workItem.githubIssueUrl == null;

    if (shouldOpenIssue && plan.issueDraft) {
      try {
        const issue = await createGitHubIssue({
          owner: options.owner,
          repo: options.repo,
          token: options.token,
          draft: plan.issueDraft,
          dryRun: options.dryRun,
          dedupeKey: plan.fingerprint,
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
            .where(eq(improvementWorkItems.id, workItem.id));
          counts.issuesCreated += 1;
          githubIssuesOpenedThisRun += 1;
        }
      } catch (err) {
        await db.insert(improvementRuns).values({
          workItemId: workItem.id,
          runType: "triage",
          agentName: options.agentName,
          status: "failed",
          summary:
            err instanceof Error
              ? `GitHub issue creation failed: ${err.message}`
              : "GitHub issue creation failed",
          metadata: {
            dryRun: options.dryRun,
            createGithubIssues: options.createGithubIssues,
            signalIds: plan.workItem.signalIds,
            retryable: true,
          },
          completedAt: new Date(),
        });
        continue;
      }
    }

    for (const signalId of plan.workItem.signalIds) {
      await db
        .update(improvementSignals)
        .set({
          status: plan.signalStatus,
          updatedAt: new Date(),
        })
        .where(eq(improvementSignals.id, signalId));
    }

    await db.insert(improvementRuns).values({
      workItemId: workItem.id,
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
