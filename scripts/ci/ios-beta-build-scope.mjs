import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const IOS_BETA_IMPACT_PREFIXES = [
  "artifacts/bumble-mobile/",
  "lib/api-client-react/",
  "lib/api-spec/",
  "lib/api-zod/",
];

export const IOS_BETA_IMPACT_FILES = new Set([
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
]);

function cleanFilePath(value) {
  return String(value || "").trim().replaceAll("\\", "/");
}

export function parseChangedFiles(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map(cleanFilePath)
    .filter(Boolean);
}

export function isIosBetaImpactingFile(filePath) {
  const normalized = cleanFilePath(filePath);
  return (
    IOS_BETA_IMPACT_FILES.has(normalized) ||
    IOS_BETA_IMPACT_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  );
}

export function decideIosBetaBuild({ eventName, changedFiles }) {
  if (eventName !== "push") {
    return {
      shouldBuild: true,
      reason: `${eventName || "manual"} run requested explicitly`,
    };
  }

  const files = Array.isArray(changedFiles) ? changedFiles : [];
  if (files.length === 0) {
    return {
      shouldBuild: true,
      reason: "no changed files detected, failing open",
    };
  }

  const impactingFiles = files.filter(isIosBetaImpactingFile);
  if (impactingFiles.length > 0) {
    return {
      shouldBuild: true,
      reason: `iOS-impacting files changed: ${impactingFiles.slice(0, 5).join(", ")}`,
    };
  }

  return {
    shouldBuild: false,
    reason: "push changed only non-mobile files",
  };
}

export function collectChangedFiles({ before, sha, execFile = execFileSync }) {
  const zeroBefore = before && /^0+$/.test(before);
  const ranges = [];
  if (before && sha && !zeroBefore) ranges.push(`${before}..${sha}`);
  if (sha) ranges.push(`${sha}^..${sha}`);

  for (const range of ranges) {
    try {
      return parseChangedFiles(
        execFile("git", ["diff", "--name-only", range], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }),
      );
    } catch {
      // Try the next available range before failing open.
    }
  }

  return [];
}

function setOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

export function runCli(env = process.env) {
  const eventName = env.GITHUB_EVENT_NAME || "";
  const changedFiles = collectChangedFiles({
    before: env.HEYTELLI_EVENT_BEFORE || "",
    sha: env.HEYTELLI_EVENT_SHA || env.GITHUB_SHA || "",
  });
  const decision = decideIosBetaBuild({ eventName, changedFiles });
  const shouldBuild = decision.shouldBuild ? "true" : "false";

  setOutput("should_build", shouldBuild);
  setOutput("reason", decision.reason);

  console.log(`should_build=${shouldBuild}`);
  console.log(`reason=${decision.reason}`);
  if (!decision.shouldBuild) {
    console.log("Changed files:");
    for (const file of changedFiles) console.log(`- ${file}`);
  }

  return decision;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
