import { pathToFileURL } from "node:url";
import type {
  ImprovementCategory,
  ImprovementRiskTier,
} from "@workspace/db";
import { planSignalTriage } from "./triage";

export type ImprovementEvalCase = {
  id: string;
  signal: Parameters<typeof planSignalTriage>[0];
  expected: {
    category: ImprovementCategory;
    riskTier: ImprovementRiskTier;
    outcome: "issue" | "blocked";
  };
};

export type ImprovementEvalReport = {
  total: number;
  passed: number;
  failed: number;
  failures: Array<{
    id: string;
    expected: ImprovementEvalCase["expected"];
    actual: {
      category: ImprovementCategory;
      riskTier: ImprovementRiskTier;
      outcome: "issue" | "blocked";
    };
  }>;
};

export const improvementEvalCases: ImprovementEvalCase[] = [
  {
    id: "settings-copy-confusing",
    signal: {
      id: 1001,
      fingerprint: "settings-copy-confusing",
      rawPayload: {
        source: "in_app_feedback",
        type: "Confusing",
        message: "The settings feedback button is confusing.",
        surface: "settings",
      },
      sanitizedSummary: "The settings feedback button is confusing.",
      sanitizedPayload: {
        type: "Confusing",
        message: "The settings feedback button is confusing.",
        surface: "settings",
      },
      privacyRisk: "low",
    },
    expected: {
      category: "ux_confusion",
      riskTier: "safe_auto_merge",
      outcome: "issue",
    },
  },
  {
    id: "ios-share-failed",
    signal: {
      id: 1002,
      fingerprint: "ios-share-failed",
      rawPayload: {
        source: "share_failure",
        type: "Bug",
        message: "iOS share sheet failed on build 41.",
        surface: "ios-share",
        clientContext: { platform: "ios", buildNumber: "41" },
      },
      sanitizedSummary: "iOS share sheet failed on build 41.",
      sanitizedPayload: {
        type: "Bug",
        message: "iOS share sheet failed on build 41.",
        surface: "ios-share",
        platform: "ios",
        buildNumber: "41",
      },
      privacyRisk: "low",
    },
    expected: {
      category: "bug",
      riskTier: "guarded_auto_merge",
      outcome: "issue",
    },
  },
  {
    id: "privacy-delete-request",
    signal: {
      id: 1003,
      fingerprint: "privacy-delete-request",
      rawPayload: {
        source: "in_app_feedback",
        type: "Safety concern",
        message: "I need delete history to remove private safety notes.",
        surface: "settings-privacy",
      },
      sanitizedSummary: "I need delete history to remove private safety notes.",
      sanitizedPayload: {
        type: "Safety concern",
        message: "I need delete history to remove private safety notes.",
        surface: "settings-privacy",
      },
      privacyRisk: "high",
    },
    expected: {
      category: "safety_issue",
      riskTier: "extra_agent_review",
      outcome: "issue",
    },
  },
  {
    id: "raw-screenshot-blocked",
    signal: {
      id: 1004,
      fingerprint: "raw-screenshot-blocked",
      rawPayload: {
        source: "in_app_feedback",
        type: "Bug",
        message: "The app exposed screenshot data:image/png;base64,abc",
        screenshot: "data:image/png;base64,abc",
      },
      sanitizedSummary: "The app exposed [private content] [image omitted]",
      sanitizedPayload: {
        type: "Bug",
        message: "The app exposed [private content] [image omitted]",
      },
      privacyRisk: "blocked",
    },
    expected: {
      category: "privacy",
      riskTier: "no_auto_merge",
      outcome: "blocked",
    },
  },
];

export function evaluateImprovementCases(
  cases: ImprovementEvalCase[],
): ImprovementEvalReport {
  const failures: ImprovementEvalReport["failures"] = [];
  for (const item of cases) {
    const plan = planSignalTriage(item.signal);
    const actual = {
      category: plan.workItem.category,
      riskTier: plan.workItem.riskTier,
      outcome: plan.issueDraft ? ("issue" as const) : ("blocked" as const),
    };
    if (
      actual.category !== item.expected.category ||
      actual.riskTier !== item.expected.riskTier ||
      actual.outcome !== item.expected.outcome
    ) {
      failures.push({ id: item.id, expected: item.expected, actual });
    }
  }
  return {
    total: cases.length,
    passed: cases.length - failures.length,
    failed: failures.length,
    failures,
  };
}

export function buildEvalReportMarkdown(report: ImprovementEvalReport): string {
  return [
    "# HeyTelli Improvement Eval Report",
    "",
    `Total: ${report.total}`,
    `Passed: ${report.passed}`,
    `Failed: ${report.failed}`,
    "",
    ...report.failures.map(
      (failure) =>
        `- ${failure.id}: expected ${JSON.stringify(
          failure.expected,
        )}, got ${JSON.stringify(failure.actual)}`,
    ),
  ].join("\n");
}

async function main(): Promise<void> {
  const report = evaluateImprovementCases(improvementEvalCases);
  console.log(buildEvalReportMarkdown(report));
  if (report.failed > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
