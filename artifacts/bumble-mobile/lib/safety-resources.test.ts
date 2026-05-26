import assert from "node:assert/strict";
import test from "node:test";

import { getSafetyResources } from "./safety-resources.ts";

test("routes interpersonal high-risk concerns to support resources", () => {
  const resources = getSafetyResources([
    {
      severity: "high",
      label: "Threats or intimidation",
      evidence: "Pattern detected.",
    },
  ]);

  assert.deepEqual(
    resources.map((resource) => resource.label),
    ["The Hotline", "RAINN"],
  );
});

test("routes scam and sextortion concerns to fraud and image-abuse resources", () => {
  const resources = getSafetyResources([
    {
      severity: "high",
      label: "Romance scam or urgent money pressure",
      evidence: "Pattern detected.",
    },
    {
      severity: "high",
      label: "Sextortion or intimate image pressure",
      evidence: "Pattern detected.",
    },
  ]);

  assert.deepEqual(
    resources.map((resource) => resource.label),
    ["ReportFraud.ftc.gov", "FBI IC3", "StopNCII"],
  );
});

test("does not show crisis resources for only low-severity reply style concerns", () => {
  const resources = getSafetyResources([
    {
      severity: "low",
      label: "Slow replies",
      evidence: "Takes a day to respond.",
    },
  ]);

  assert.deepEqual(resources, []);
});
