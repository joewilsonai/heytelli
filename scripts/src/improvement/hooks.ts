import type { ImprovementRiskTier } from "@workspace/db";

export type HookCommand = {
  command: string;
  args: string[];
  cwd: string;
};

export type ExecutorHookPlan = {
  pre: HookCommand[];
  post: HookCommand[];
};

const DENYLIST: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bgit\s+reset\s+--hard\b/i, label: "git reset --hard" },
  { pattern: /\bgit\s+checkout\s+--\b/i, label: "git checkout --" },
  { pattern: /\brm\s+-rf\s+\/(?:\s|$)/i, label: "rm -rf /" },
  { pattern: /\bpsql\b/i, label: "psql" },
  { pattern: /\bdrop\s+(?:database|schema|table)\b/i, label: "drop database/schema/table" },
  { pattern: /\bgh\s+repo\s+delete\b/i, label: "gh repo delete" },
  { pattern: /\brailway\s+(?:delete|down|remove)\b/i, label: "railway delete/down/remove" },
];

export function validateAgentCommandSafety(command: string | null): string[] {
  if (!command) return [];
  return DENYLIST.flatMap((entry) =>
    entry.pattern.test(command) ? [`Denylisted command: ${entry.label}`] : [],
  );
}

export function buildExecutorHookPlan(input: {
  riskTier: ImprovementRiskTier;
  repoRoot: string;
  worktreePath: string;
}): ExecutorHookPlan {
  return {
    pre: [
      {
        command: "git",
        args: ["status", "--porcelain"],
        cwd: input.worktreePath,
      },
    ],
    post: [
      {
        command: "git",
        args: ["diff", "--check"],
        cwd: input.worktreePath,
      },
      {
        command: "pnpm",
        args: ["run", "typecheck"],
        cwd: input.worktreePath,
      },
    ],
  };
}
