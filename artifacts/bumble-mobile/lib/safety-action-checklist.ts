export type SafetyActionFlag = {
  severity: "low" | "medium" | "high";
  label: string;
  evidence?: string;
};

export type SafetyAction = {
  label: string;
  tone: "warning" | "danger";
};

function hasPattern(flags: SafetyActionFlag[], pattern: RegExp): boolean {
  return flags.some((flag) =>
    pattern.test(`${flag.label} ${flag.evidence ?? ""}`),
  );
}

function unique(actions: SafetyAction[]): SafetyAction[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    if (seen.has(action.label)) return false;
    seen.add(action.label);
    return true;
  });
}

export function getSafetyActionChecklist(
  flags: SafetyActionFlag[],
): SafetyAction[] {
  if (!flags.some((flag) => flag.severity !== "low")) return [];

  const actions: SafetyAction[] = [];
  if (hasPattern(flags, /scam|money|gift card|crypto|fraud|wallet|payment/i)) {
    actions.push(
      {
        label: "Do not send money, gift cards, crypto, or banking details",
        tone: "danger",
      },
      {
        label: "Keep the original messages and profile screenshots",
        tone: "warning",
      },
      {
        label: "Report money pressure through FTC or IC3 if anything was sent",
        tone: "warning",
      },
    );
  }

  if (hasPattern(flags, /sextortion|intimate image|nude|explicit|photo/i)) {
    actions.push(
      {
        label: "Do not send more intimate photos or proof",
        tone: "danger",
      },
      {
        label: "Save originals in case you need to report image abuse",
        tone: "warning",
      },
    );
  }

  if (
    hasPattern(
      flags,
      /threat|intimidat|stalk|harass|boundary|privacy|unsafe|coerc|private location/i,
    )
  ) {
    actions.push(
      {
        label: "Tell your circle before responding or meeting",
        tone: "danger",
      },
      {
        label: "Keep the date in a public place with your own ride",
        tone: "warning",
      },
      {
        label: "Block or report if contact continues after a clear no",
        tone: "warning",
      },
    );
  }

  return unique(actions).slice(0, 4);
}
