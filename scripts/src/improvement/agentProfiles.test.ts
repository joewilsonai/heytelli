import assert from "node:assert/strict";
import test from "node:test";

import {
  agentProfilesForWorkItem,
  buildAgentProfilePromptSection,
} from "./agentProfiles";

const workItem = {
  title: "Feedback: iOS share sheet TestFlight release is broken",
  summary: "The Expo mobile share flow needs release verification.",
  category: "bug" as const,
  riskTier: "extra_agent_review" as const,
};

test("selects repo-local specialist profiles for swarm work", () => {
  const profiles = agentProfilesForWorkItem(workItem);

  assert.deepEqual(
    profiles.map((profile) => profile.id),
    [
      "api_server",
      "expo_mobile",
      "web_app",
      "privacy_review",
      "release_verification",
    ],
  );
});

test("adds web parity guidance for user-facing mobile work", () => {
  const profiles = agentProfilesForWorkItem({
    title: "Feedback: settings should include three more color themes",
    summary: "User-facing mobile settings need more theme options.",
    category: "feature_request",
    riskTier: "guarded_auto_merge",
  });

  assert.ok(profiles.some((profile) => profile.id === "expo_mobile"));
  assert.ok(profiles.some((profile) => profile.id === "web_app"));

  const section = buildAgentProfilePromptSection(profiles);
  assert.match(section, /artifacts\/heytelli-web/);
  assert.match(section, /mobile-web fidelity/i);
});

test("standard prompt section reminds agents to check web parity", () => {
  const section = buildAgentProfilePromptSection([]);

  assert.match(section, /artifacts\/heytelli-web/);
  assert.match(section, /when feasible/i);
});

test("builds a prompt section with required commands and boundaries", () => {
  const section = buildAgentProfilePromptSection(
    agentProfilesForWorkItem(workItem),
  );

  assert.match(section, /api_server/);
  assert.match(section, /expo_mobile/);
  assert.match(section, /pnpm run typecheck/);
  assert.match(section, /Do not copy private database rows/);
  assert.doesNotMatch(section, /secret-token|very-secret|token value/i);
});
