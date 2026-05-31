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
    id: "web_app",
    title: "User web app specialist",
    appliesWhen:
      "Consumer web, Android web, browser UI, or user-facing mobile changes that should stay in mobile-web fidelity when feasible.",
    requiredCommands: [
      "pnpm --filter @workspace/heytelli-web run test",
      "pnpm --filter @workspace/heytelli-web run typecheck",
      "pnpm --filter @workspace/heytelli-web run build",
    ],
    guardrails: [
      "Check artifacts/heytelli-web for user-facing workflow, settings, theme, copy, and API-backed behavior parity when mobile changes land.",
      "If web parity is not feasible in the same PR, explain why in the PR.",
      "Do not repoint the landing/ beta signup deployment at the logged-in web app.",
      "Do not expose model-provider API keys in browser code.",
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
  const isMobileWork = /\b(ios|expo|mobile|testflight|share|eas)\b/.test(text);
  const isWebWork = /\b(web|browser|android|vite|heytelli-web)\b/.test(text);
  if (isMobileWork) {
    add("expo_mobile");
  }
  if (isMobileWork || isWebWork) {
    add("web_app");
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
    return [
      "Agent profiles: standard HeyTelli implementation profile.",
      "Mobile-web fidelity: for user-facing workflow, settings, theme, copy, and API-backed behavior changes, check artifacts/heytelli-web and update it when feasible; if not feasible, explain why in the PR.",
    ].join("\n");
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
