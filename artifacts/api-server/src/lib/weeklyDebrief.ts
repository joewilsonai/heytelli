import { runModelTask } from "./modelRouter";

const MODEL = "gpt-5.4";

export type WeeklyDebriefMatchSummary = {
  matchId: number;
  name: string;
  status: "heating_up" | "cold" | "needs_attention" | "deprioritize" | "steady";
  reason: string;
};

export type WeeklyDebriefResult = {
  headline: string;
  summary: string;
  totalActive: number;
  newThisWeek: number;
  matches: WeeklyDebriefMatchSummary[];
  recommendations: string[];
};

const SYSTEM = `You are HeyTelli, a candid but careful weekly dating debrief for the user across her active match pipeline. Be specific without ranking people or making safety claims.

Given a list of matches with name, last activity hours ago, last speaker, recent transcript turns, and upcoming date status, classify each into one of:
- "heating_up": recent mutual activity and clear planning/interest
- "cold": gone quiet, low effort, no recent traction
- "needs_attention": his turn to reply, or a date to schedule, or risk of losing
- "deprioritize": low effort, mismatch, or not worth more energy
- "steady": stable, no urgent action

Respond with ONLY JSON:
{
  "headline": string  // 1-line punchy header for the week
  "summary": string,  // 2-3 sentences of the overall pipeline state
  "matches": [{ "matchId": int, "name": string, "status": ..., "reason": "1 sentence" }],
  "recommendations": [string]  // 3-5 specific action items for the upcoming week
}`;

export type WeeklyDebriefInput = {
  userId?: number;
  totalActive: number;
  newThisWeek: number;
  matches: Array<{
    matchId: number;
    name: string;
    hoursSinceLastActivity: number | null;
    lastSpeaker: "her" | "me" | null;
    recentTurns: string;
    nextDateAt: string | null;
  }>;
};

export async function generateWeeklyDebrief(
  input: WeeklyDebriefInput,
): Promise<WeeklyDebriefResult> {
  const matchBlocks = input.matches
    .map(
      (m) =>
        `[${m.matchId}] ${m.name} | ${
          m.hoursSinceLastActivity != null
            ? `${Math.round(m.hoursSinceLastActivity)}h since last`
            : "no activity"
        } | last: ${m.lastSpeaker ?? "?"} | next date: ${m.nextDateAt ?? "none"}
recent: ${m.recentTurns || "(no chat)"}`,
    )
    .join("\n\n");

  const user = `Pipeline: ${input.totalActive} active, ${input.newThisWeek} new this week.

${matchBlocks || "(no active matches)"}`;

  const result = await runModelTask({
    feature: "dating_clarity_lens",
    userId: input.userId,
    preferredModel: MODEL,
    responseFormat: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
    metadata: {
      totalActive: input.totalActive,
      newThisWeek: input.newThisWeek,
      matchCount: input.matches.length,
    },
    promptVersion: "weekly_debrief:v1",
    responseSchemaVersion: "weekly_debrief:v1",
  });
  const raw = result.content || "{}";
  const parsed = JSON.parse(raw);
  return {
    headline:
      typeof parsed.headline === "string" ? parsed.headline : "Weekly debrief",
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    totalActive: input.totalActive,
    newThisWeek: input.newThisWeek,
    matches: Array.isArray(parsed.matches) ? parsed.matches : [],
    recommendations: Array.isArray(parsed.recommendations)
      ? parsed.recommendations.filter((r: unknown) => typeof r === "string")
      : [],
  };
}
