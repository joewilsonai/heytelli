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
    ["api_server", "expo_mobile", "privacy_review", "release_verification"],
  );
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
