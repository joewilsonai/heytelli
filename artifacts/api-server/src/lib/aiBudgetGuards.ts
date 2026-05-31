export type BudgetGuardEnv = Partial<
  Record<"AI_MODEL_CALLS_DISABLED" | "AI_MONTHLY_BUDGET_WARNING_USD", string>
>;

export type NoNewEvidenceInput = {
  lastAnalysisFingerprint?: string | null;
  currentEvidenceFingerprint?: string | null;
  newEvidenceCount?: number | null;
  force?: boolean;
};

export function isModelCallsDisabled(
  env: BudgetGuardEnv = process.env,
): boolean {
  const value = env.AI_MODEL_CALLS_DISABLED?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

export function getModelCallsDisabledFallback(): string {
  return "HeyTelli can't generate a new Calm Read right now, but your saved observations and timeline are still available.";
}

export function shouldSkipNoNewEvidenceAnalysis(
  input: NoNewEvidenceInput,
): boolean {
  if (input.force) return false;
  const newEvidenceCount = input.newEvidenceCount ?? 0;
  if (newEvidenceCount > 0) return false;
  return Boolean(
    input.lastAnalysisFingerprint &&
      input.currentEvidenceFingerprint &&
      input.lastAnalysisFingerprint === input.currentEvidenceFingerprint,
  );
}

export function parseMonthlyBudgetWarningUsd(
  env: BudgetGuardEnv = process.env,
): number | null {
  const raw = env.AI_MONTHLY_BUDGET_WARNING_USD?.trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}
