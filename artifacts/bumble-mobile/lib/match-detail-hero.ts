import {
  getHomeMatchCardModel,
  type HomeMatchCardMatch,
  type HomePrimaryActionKind,
  type HomeSignalTone,
} from "./home-match-card.ts";

export type MatchDetailHeroModel = {
  eyebrow: string;
  title: string;
  body: string;
  tone: HomeSignalTone;
  chips: string[];
};

export function getMatchDetailHeroModel(
  match: HomeMatchCardMatch,
  now = new Date(),
): MatchDetailHeroModel {
  const model = getHomeMatchCardModel(match, now);
  const { kind } = model.primaryAction;

  const bodyByKind: Record<HomePrimaryActionKind, string> = {
    add_screenshots:
      "Start with the latest profile or chat screenshots so HeyTelli can build a grounded read.",
    review_screenshots:
      "New screenshots are waiting. Telli will keep the last read visible, then refresh it when you reanalyze.",
    make_date_card:
      "Finish the Date Card before you meet: place, time, transport, check-in, and circle note.",
    share_date_card:
      "Your plan is ready. Share it with your circle, then use check-ins during the date.",
    open_date_mode:
      "Date Mode is active. Keep check-ins close, use your cover if you need privacy, and close the loop when you are home safe.",
    review_pattern:
      "A saved pattern needs your eyes. Review the evidence, then decide what feels right.",
    review_reply:
      "There is enough context to look at the next reply with a little more clarity.",
    wait: "You have a stable read for now. No action needed unless something changes.",
    decide_next_move:
      "This connection is waiting on a decision: follow up, pause, or let it fade.",
  };

  return {
    eyebrow: model.section.label,
    title: model.primaryAction.label,
    body: bodyByKind[kind],
    tone: model.primaryAction.tone,
    chips: [
      model.signal.label,
      model.read.freshnessLabel,
      ...model.contextChips,
    ]
      .filter(Boolean)
      .slice(0, 4),
  };
}
