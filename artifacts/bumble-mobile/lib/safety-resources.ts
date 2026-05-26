export type SafetyResourceFlag = {
  severity: "low" | "medium" | "high";
  label: string;
  evidence?: string;
};

export type SafetyResource = {
  label: string;
  url: string;
  note: string;
};

const HOTLINE_RESOURCES: SafetyResource[] = [
  {
    label: "The Hotline",
    url: "https://www.thehotline.org/",
    note: "Support for threats, control, stalking, or relationship abuse.",
  },
  {
    label: "RAINN",
    url: "https://rainn.org/",
    note: "Support for sexual pressure, coercion, or assault concerns.",
  },
];

const SCAM_RESOURCES: SafetyResource[] = [
  {
    label: "ReportFraud.ftc.gov",
    url: "https://reportfraud.ftc.gov/",
    note: "Report money, gift card, crypto, or verification scams.",
  },
  {
    label: "FBI IC3",
    url: "https://www.ic3.gov/",
    note: "Report online extortion, fraud, and cybercrime.",
  },
];

const IMAGE_ABUSE_RESOURCES: SafetyResource[] = [
  {
    label: "StopNCII",
    url: "https://stopncii.org/",
    note: "Help prevent non-consensual adult intimate image sharing.",
  },
];

function hasLabel(flags: SafetyResourceFlag[], pattern: RegExp): boolean {
  return flags.some((flag) => pattern.test(`${flag.label} ${flag.evidence ?? ""}`));
}

function unique(resources: SafetyResource[]): SafetyResource[] {
  const seen = new Set<string>();
  return resources.filter((resource) => {
    if (seen.has(resource.url)) return false;
    seen.add(resource.url);
    return true;
  });
}

export function getSafetyResources(
  flags: SafetyResourceFlag[],
): SafetyResource[] {
  const highRisk = flags.some((flag) => flag.severity === "high");
  if (!highRisk) return [];

  const resources: SafetyResource[] = [];
  if (
    hasLabel(
      flags,
      /threat|intimidat|stalk|harass|boundary|privacy|unsafe|coerc/i,
    )
  ) {
    resources.push(...HOTLINE_RESOURCES);
  }
  if (hasLabel(flags, /scam|money|gift card|crypto|fraud|wallet|payment/i)) {
    resources.push(...SCAM_RESOURCES);
  }
  if (hasLabel(flags, /sextortion|intimate image|nude|explicit/i)) {
    resources.push(...IMAGE_ABUSE_RESOURCES);
  }

  return unique(resources);
}
