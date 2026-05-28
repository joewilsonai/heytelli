import type {
  ImprovementCategory,
  ImprovementPriority,
  ImprovementPrivacyRisk,
  ImprovementRiskTier,
} from "@workspace/db";

export type SwarmAgentRole =
  | "researcher"
  | "builder"
  | "product_reviewer"
  | "privacy_reviewer"
  | "safety_reviewer"
  | "backend_api_reviewer"
  | "code_reviewer"
  | "test_reviewer";

export type SwarmAutoMergeMode =
  | "auto_merge_after_checks"
  | "auto_merge_after_review"
  | "multi_review_then_auto_merge"
  | "no_auto_merge";

export type SwarmPlanInput = {
  category: ImprovementCategory;
  priority: ImprovementPriority;
  riskTier: ImprovementRiskTier;
  privacyRisk: ImprovementPrivacyRisk;
  labels: string[];
};

export type SwarmPlan = {
  riskTier: ImprovementRiskTier;
  requiredAgentRoles: SwarmAgentRole[];
  autoMergePolicy: {
    mode: SwarmAutoMergeMode;
    allowed: boolean;
  };
  requiredChecks: string[];
  reason: string;
};

const BLOCKING_LABELS = new Set([
  "contains-private-context",
  "needs-more-signal",
  "swarm-blocked",
  "swarm-done",
  "swarm-active",
  "swarm-planned",
  "swarm-running",
  "wontfix",
]);

export function normalizeLabels(labels: string[]): string[] {
  return labels.map((label) => label.trim().toLowerCase()).filter(Boolean);
}

export function issueLabelsAllowSwarmPlanning(labels: string[]): boolean {
  const normalized = normalizeLabels(labels);
  if (!normalized.includes("agent-ready")) return false;
  if (!normalized.some((label) => label.startsWith("risk:"))) return false;
  return !normalized.some((label) => BLOCKING_LABELS.has(label));
}

export function riskTierFromLabels(
  labels: string[],
  fallback: ImprovementRiskTier,
): ImprovementRiskTier {
  const normalized = normalizeLabels(labels);
  if (normalized.includes("risk:no_auto_merge")) return "no_auto_merge";
  if (normalized.includes("risk:extra_agent_review")) return "extra_agent_review";
  if (normalized.includes("risk:guarded_auto_merge")) return "guarded_auto_merge";
  if (normalized.includes("risk:safe_auto_merge")) return "safe_auto_merge";
  return fallback;
}

export function priorityFromLabels(
  labels: string[],
  fallback: ImprovementPriority,
): ImprovementPriority {
  const normalized = normalizeLabels(labels);
  if (normalized.includes("priority:p0")) return "p0";
  if (normalized.includes("priority:p1")) return "p1";
  if (normalized.includes("priority:p2")) return "p2";
  if (normalized.includes("priority:p3")) return "p3";
  return fallback;
}

function effectiveRiskTier(input: SwarmPlanInput): ImprovementRiskTier {
  const labeledRisk = riskTierFromLabels(input.labels, input.riskTier);
  if (input.privacyRisk === "blocked") return "no_auto_merge";
  if (input.priority === "p0") return "no_auto_merge";
  if (input.category === "privacy" && input.privacyRisk === "high") {
    return "no_auto_merge";
  }
  if (input.category === "safety_issue") return "extra_agent_review";
  if (input.privacyRisk === "high") return "extra_agent_review";
  if (input.privacyRisk === "medium" && labeledRisk === "safe_auto_merge") {
    return "guarded_auto_merge";
  }
  return labeledRisk;
}

export function buildSwarmPlan(input: SwarmPlanInput): SwarmPlan {
  const riskTier = effectiveRiskTier({
    ...input,
    priority: priorityFromLabels(input.labels, input.priority),
  });

  if (riskTier === "no_auto_merge") {
    return {
      riskTier,
      requiredAgentRoles: ["researcher", "product_reviewer"],
      autoMergePolicy: { mode: "no_auto_merge", allowed: false },
      requiredChecks: ["research summary", "implementation plan"],
      reason: "Research and planning only; merge requires owner action.",
    };
  }

  if (riskTier === "extra_agent_review") {
    return {
      riskTier,
      requiredAgentRoles: [
        "researcher",
        "builder",
        "privacy_reviewer",
        "safety_reviewer",
        "backend_api_reviewer",
        "code_reviewer",
        "test_reviewer",
      ],
      autoMergePolicy: {
        mode: "multi_review_then_auto_merge",
        allowed: true,
      },
      requiredChecks: [
        "privacy review",
        "safety review",
        "backend/api review when applicable",
        "code review",
        "test review",
        "rollback plan",
      ],
      reason: "High-impact safety/privacy-sensitive work needs specialized review.",
    };
  }

  if (riskTier === "guarded_auto_merge") {
    return {
      riskTier,
      requiredAgentRoles: [
        "researcher",
        "builder",
        "product_reviewer",
        "privacy_reviewer",
        "code_reviewer",
      ],
      autoMergePolicy: { mode: "auto_merge_after_review", allowed: true },
      requiredChecks: [
        "product review",
        "privacy review",
        "code/test review",
        "smoke test plan",
      ],
      reason: "Non-sensitive behavior changes can merge after stronger review.",
    };
  }

  return {
    riskTier,
    requiredAgentRoles: ["researcher", "builder", "code_reviewer"],
    autoMergePolicy: { mode: "auto_merge_after_checks", allowed: true },
    requiredChecks: ["focused tests", "code review"],
    reason: "Low-risk work can merge after standard checks.",
  };
}

export function canAutoMergeSwarmPlan(plan: SwarmPlan): boolean {
  return plan.autoMergePolicy.allowed && plan.riskTier !== "no_auto_merge";
}
