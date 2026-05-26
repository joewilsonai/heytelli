export type DatingPatternGlossaryTerm = {
  term: string;
  category: "behavior" | "slang" | "status";
  plainMeaning: string;
};

export const DATING_PATTERN_GLOSSARY: DatingPatternGlossaryTerm[] = [
  {
    term: "Breadcrumbing",
    category: "behavior",
    plainMeaning:
      "Small bits of attention without real follow-through or plans.",
  },
  {
    term: "Benching",
    category: "behavior",
    plainMeaning: "Keeping someone as a backup while investing somewhere else.",
  },
  {
    term: "Orbiting",
    category: "behavior",
    plainMeaning:
      "Disappearing from the conversation but still watching stories or posts.",
  },
  {
    term: "Zombieing",
    category: "behavior",
    plainMeaning: "Coming back after ghosting as if nothing happened.",
  },
  {
    term: "Roaching",
    category: "behavior",
    plainMeaning:
      "Hiding that they are seeing other people, then minimizing it when caught.",
  },
  {
    term: "Kittenfishing",
    category: "behavior",
    plainMeaning:
      "Small profile misrepresentations like old photos or inflated details.",
  },
  {
    term: "Catfishing",
    category: "behavior",
    plainMeaning: "Using a fake identity or heavily false profile.",
  },
  {
    term: "Love bombing",
    category: "behavior",
    plainMeaning:
      "Very intense affection or future-talk early, especially if it pressures commitment.",
  },
  {
    term: "F-boy / fuckboy",
    category: "slang",
    plainMeaning:
      "Slang for saying what gets intimacy while avoiding real care or follow-through.",
  },
  {
    term: "Softboy",
    category: "slang",
    plainMeaning:
      "Sensitive or artsy presentation used to create intimacy without consistency.",
  },
  {
    term: "Nice Guy",
    category: "slang",
    plainMeaning:
      "Niceness performed with an expectation of romantic or sexual reward.",
  },
  {
    term: "Pick-me boy",
    category: "slang",
    plainMeaning:
      "The 'not like other guys' pitch, often mixed with self-pity.",
  },
  {
    term: "Himbo",
    category: "slang",
    plainMeaning:
      "Affectionate slang for hot, sweet, respectful, and not too deep.",
  },
  {
    term: "Situationship",
    category: "status",
    plainMeaning:
      "More than friends, less than defined, often unclear on purpose.",
  },
  {
    term: "DTR",
    category: "status",
    plainMeaning: "Define-the-relationship conversation.",
  },
  {
    term: "The ick",
    category: "status",
    plainMeaning: "A sudden loss of attraction or comfort.",
  },
  {
    term: "Beige flag",
    category: "status",
    plainMeaning: "Not bad, just notably bland, odd, or low-signal.",
  },
];

export function getDatingPatternTerms(
  category?: DatingPatternGlossaryTerm["category"],
): DatingPatternGlossaryTerm[] {
  return category
    ? DATING_PATTERN_GLOSSARY.filter((term) => term.category === category)
    : DATING_PATTERN_GLOSSARY;
}
