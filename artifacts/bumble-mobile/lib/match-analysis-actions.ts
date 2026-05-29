export type MatchAnalysisAction = "read" | "patterns" | "dateBrief";

export type MatchAnalysisActionPlan = {
  visible: boolean;
  label: "Analyze new";
  title: string;
  body: string;
  actions: MatchAnalysisAction[];
  pendingCount: number;
};

type MatchAnalysisPlanInput = {
  screenshots?: unknown[];
  screenshotCount?: number;
  pendingScreenshotCount: number;
  failedScreenshotCount: number;
  analysisFreshness: string;
  readFreshness?: string;
  dateBriefFreshness?: string;
  nextDateAt?: string | null;
};

function uploadedScreenshotCount(match: MatchAnalysisPlanInput): number {
  if (typeof match.screenshotCount === "number") return match.screenshotCount;
  return match.screenshots?.length ?? 0;
}

function hasFutureDate(value: string | null | undefined, now: Date): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time > now.getTime();
}

function surfaceList(actions: MatchAnalysisAction[]): string {
  const labels = actions.map((action) =>
    action === "dateBrief"
      ? "date brief"
      : action === "patterns"
        ? "patterns"
        : "latest read",
  );
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return labels.join(" and ");
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

export function getMatchAnalysisActionPlan(
  match: MatchAnalysisPlanInput,
  now = new Date(),
): MatchAnalysisActionPlan {
  const pendingCount =
    match.pendingScreenshotCount + match.failedScreenshotCount;
  const hasScreenshots = uploadedScreenshotCount(match) > 0;
  const needsAnalysis =
    hasScreenshots &&
    (pendingCount > 0 ||
      match.analysisFreshness !== "current" ||
      match.readFreshness !== "current");
  const shouldUpdateDateBrief =
    needsAnalysis &&
    hasFutureDate(match.nextDateAt, now) &&
    (pendingCount > 0 || match.dateBriefFreshness !== "current");
  const actions: MatchAnalysisAction[] = shouldUpdateDateBrief
    ? ["read", "patterns", "dateBrief"]
    : ["read", "patterns"];
  const surfaces = surfaceList(actions);

  return {
    visible: needsAnalysis,
    label: "Analyze new",
    title:
      pendingCount > 0
        ? `${pendingCount} new screenshot${pendingCount === 1 ? "" : "s"} waiting`
        : "New analysis available",
    body:
      pendingCount > 0
        ? `Update ${surfaces} together from the new screenshots.`
        : `Update ${surfaces} together from the latest saved screenshots.`,
    actions,
    pendingCount,
  };
}
