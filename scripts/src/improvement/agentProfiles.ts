import type {
  ImprovementCategory,
  ImprovementRiskTier,
} from "@workspace/db";

export type AgentProfile = {
  id: string;
  title: string;
  appliesWhen: string;
  requiredCommands: string[];
  guardrails: string[];
};

export type AgentProfileWorkItem = {
  title: string;
  summary: string;
  category: ImprovementCategory;
  riskTier: ImprovementRiskTier;
};

const PROFILES: AgentProfile[] = [
  {
    id: "api_server",
    title: "API server specialist",
    appliesWhen: "Backend, auth, storage, improvement pipeline, or generated API work.",
    requiredCommands: ["pnpm run typecheck"],
    guardrails: [
      "Keep raw feedback and dating context in private database rows.",
      "Update route/lib tests for API behavior changes.",
    ],
  },
  {
    id: "expo_mobile",
    title: "Expo mobile specialist",
    appliesWhen: "iOS, Expo, share extension, mobile UI, TestFlight, or generated client work.",
    requiredCommands: [
      "pnpm --filter @workspace/bumble-mobile run typecheck",
    ],
    guardrails: [
      "Do not add hosted sharing surfaces for private user data.",
      "Preserve native iPhone share and beta sign-in flows.",
    ],
  },
  {
    id: "privacy_review",
    title: "Privacy reviewer",
    appliesWhen: "Any privacy, safety, auth, storage, or extra-review work.",
    requiredCommands: ["git diff --check", "pnpm run typecheck"],
    guardrails: [
      "Do not copy private database rows into GitHub-visible surfaces.",
      "Check screenshots, transcripts, names, phone numbers, addresses, tokens, and exact locations are absent.",
    ],
  },
  {
    id: "release_verification",
    title: "Release verification specialist",
    appliesWhen: "EAS, App Store Connect, TestFlight, CI, or post-merge lifecycle work.",
    requiredCommands: [
      "pnpm --filter @workspace/scripts run test:ci-workflows",
    ],
    guardrails: [
      "Do not call TestFlight done until App Store Connect processing and tester availability are confirmed.",
      "Keep release credentials in the runner secret store.",
    ],
  },
];

function textFor(workItem: AgentProfileWorkItem): string {
  return `${workItem.title}\n${workItem.summary}`.toLowerCase();
}

export function agentProfilesForWorkItem(
  workItem: AgentProfileWorkItem,
): AgentProfile[] {
  const text = textFor(workItem);
  const selected = new Map<string, AgentProfile>();
  function add(id: string): void {
    const profile = PROFILES.find((item) => item.id === id);
    if (profile) selected.set(profile.id, profile);
  }

  if (
    ["bug", "reliability", "privacy", "safety_issue"].includes(
      workItem.category,
    )
  ) {
    add("api_server");
  }
  if (/\b(ios|expo|mobile|testflight|share|eas)\b/.test(text)) {
    add("expo_mobile");
  }
  if (
    workItem.riskTier === "extra_agent_review" ||
    /\b(privacy|safety|auth|storage|delete|token)\b/.test(text)
  ) {
    add("privacy_review");
  }
  if (/\b(testflight|eas|release|build|app store|ci)\b/.test(text)) {
    add("release_verification");
  }

  return Array.from(selected.values());
}

export function buildAgentProfilePromptSection(
  profiles: AgentProfile[],
): string {
  if (profiles.length === 0) {
    return "Agent profiles: standard HeyTelli implementation profile.";
  }
  return [
    "Repo-local agent profiles to honor:",
    ...profiles.flatMap((profile) => [
      `- ${profile.id}: ${profile.title}`,
      `  Applies when: ${profile.appliesWhen}`,
      `  Required commands: ${profile.requiredCommands.join("; ")}`,
      `  Guardrails: ${profile.guardrails.join(" ")}`,
    ]),
  ].join("\n");
}
