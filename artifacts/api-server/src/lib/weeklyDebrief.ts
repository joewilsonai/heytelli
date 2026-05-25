import { openai } from "@workspace/integrations-openai-ai-server";

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

const SYSTEM = `You are a candid dating coach producing a weekly Sunday debrief for the user across their entire active match pipeline. Be ruthless and specific. No filler.

Given a list of matches with name, scores, last activity hours ago, last speaker, recent transcript turns, you must classify each into one of:
- "heating_up": recent activity, her engaging well, scores trending up
- "cold": gone quiet, low effort, no recent traction
- "needs_attention": his turn to reply, or a date to schedule, or risk of losing
- "deprioritize": low scores, low effort, not worth more energy
- "steady": stable, no urgent action

Respond with ONLY JSON:
{
  "headline": string  // 1-line punchy header for the week
  "summary": string,  // 2-3 sentences of the overall pipeline state
  "matches": [{ "matchId": int, "name": string, "status": ..., "reason": "1 sentence" }],
  "recommendations": [string]  // 3-5 specific action items for the upcoming week
}`;

export type WeeklyDebriefInput = {
  totalActive: number;
  newThisWeek: number;
  matches: Array<{
    matchId: number;
    name: string;
    scores: { sex: number | null; conv: number | null; chem: number | null };
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
        `[${m.matchId}] ${m.name} | scores S:${m.scores.sex ?? "?"} C:${m.scores.conv ?? "?"} Ch:${m.scores.chem ?? "?"} | ${
          m.hoursSinceLastActivity != null
            ? `${Math.round(m.hoursSinceLastActivity)}h since last`
            : "no activity"
        } | last: ${m.lastSpeaker ?? "?"} | next date: ${m.nextDateAt ?? "none"}
recent: ${m.recentTurns || "(no chat)"}`,
    )
    .join("\n\n");

  const user = `Pipeline: ${input.totalActive} active, ${input.newThisWeek} new this week.

${matchBlocks || "(no active matches)"}`;

  const completion = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw);
  return {
    headline: typeof parsed.headline === "string" ? parsed.headline : "Weekly debrief",
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    totalActive: input.totalActive,
    newThisWeek: input.newThisWeek,
    matches: Array.isArray(parsed.matches) ? parsed.matches : [],
    recommendations: Array.isArray(parsed.recommendations)
      ? parsed.recommendations.filter((r: unknown) => typeof r === "string")
      : [],
  };
}
