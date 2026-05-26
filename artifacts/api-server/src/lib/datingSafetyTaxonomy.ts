import type {
  DateHistoryEntry,
  ExtractedProfile,
  TranscriptTurn,
} from "@workspace/db";
import type { RedFlag } from "./redFlagRadar";

type SafetyInput = {
  name: string;
  profile: ExtractedProfile;
  transcript: TranscriptTurn[];
  dateHistory: DateHistoryEntry[];
  notes: string;
};

type SafetyRule = {
  severity: RedFlag["severity"];
  label: string;
  evidence: string;
  patterns: RegExp[];
};

const rules: SafetyRule[] = [
  {
    severity: "high",
    label: "Romance scam or urgent money pressure",
    evidence:
      "Pattern detected: asks for money or gift cards before trust is established.",
    patterns: [
      /\b(send|wire|transfer|loan|venmo|cashapp|zelle|paypal)\b.{0,80}\b(money|cash|funds|dollars?|\$)\b/i,
      /\b(gift cards?|itunes card|steam card|google play card|crypto|bitcoin|wallet)\b/i,
      /\b(my )?(wallet|bank account|card)\b.{0,40}\b(frozen|locked|blocked|not working)\b/i,
    ],
  },
  {
    severity: "high",
    label: "Sextortion or intimate image pressure",
    evidence:
      "Pattern detected: pressures for intimate images, secrecy, or sexual content that could be used coercively.",
    patterns: [
      /\b(send|show|give me)\b.{0,40}\b(nudes?|pics?|photos?|videos?)\b/i,
      /\b(keep|this stays|don't tell|do not tell)\b.{0,40}\b(secret|between us|private)\b/i,
      /\b(intimate|explicit|sexy)\b.{0,30}\b(photo|image|pic|video)\b/i,
    ],
  },
  {
    severity: "medium",
    label: "Boundary pressure after a no",
    evidence:
      "Pattern detected: pushes past a stated boundary, refusal, or comfort limit.",
    patterns: [
      /\b(stop saying no|don't say no|why not|come on)\b/i,
      /\b(if you liked me|if you cared|prove it)\b.{0,60}\b(come over|meet|send|do it)\b/i,
      /\b(no|not comfortable|slow down|not ready)\b.{0,80}\b(please|come on|just|you should|you would)\b/i,
    ],
  },
  {
    severity: "high",
    label: "Stalking or harassment signals",
    evidence:
      "Pattern detected: monitoring, showing up, or repeated contact after disengagement.",
    patterns: [
      /\b(i )?(saw|watched|waited|followed)\b.{0,80}\b(work|home|car|outside|apartment|office)\b/i,
      /\b(after|when)\b.{0,40}\b(stopped replying|ignored me|blocked me)\b/i,
      /\b(kept calling|kept texting|made new accounts?|showed up)\b/i,
    ],
  },
  {
    severity: "medium",
    label: "Digital privacy pressure",
    evidence:
      "Pattern detected: asks for private access, location, passwords, or identifying details too early.",
    patterns: [
      /\b(send|share|give me)\b.{0,50}\b(address|live location|location screenshot|where you live)\b/i,
      /\b(password|passcode|login|icloud|snapchat|instagram)\b/i,
      /\b(track|find my|share your location)\b/i,
    ],
  },
  {
    severity: "high",
    label: "Threats or intimidation",
    evidence:
      "Pattern detected: uses threats, intimidation, or fear to influence what happens next.",
    patterns: [
      /\b(i will|i'll|im going to|i am going to)\b.{0,40}\b(hurt|kill|ruin|expose|destroy)\b/i,
      /\b(threat|threaten|you'll regret|make you pay)\b/i,
      /\b(if you|unless you)\b.{0,60}\b(hurt|expose|ruin|tell everyone)\b/i,
    ],
  },
  {
    severity: "medium",
    label: "Unsafe first-date setup pressure",
    evidence:
      "Pattern detected: pressures for a private, secret, intoxication-heavy, or hard-to-leave first-date setup.",
    patterns: [
      /\b(pick(ing)? you up|come to my place|come over|my apartment|my hotel)\b/i,
      /\b(venue|place|location|where we'?re going)\b.{0,50}\b(secret|surprise|won't tell)\b/i,
      /\b(push(ed)? drinks?|kept ordering drinks?|drink more)\b/i,
      /\b(first meet|first date|meetup)\b.{0,80}\b(private|not public|my place|home)\b/i,
    ],
  },
];

function normalizeForScan(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildSafetyText(input: SafetyInput): string {
  const transcript = input.transcript
    .slice(-80)
    .map((turn) => `${turn.speaker}: ${turn.text}`)
    .join("\n");
  const dates = input.dateHistory
    .slice(-20)
    .map((date) => `${date.location ?? ""} ${date.recap}`)
    .join("\n");
  return normalizeForScan(
    [
      input.name,
      input.profile.conversationTone ?? "",
      input.profile.interests.join(" "),
      transcript,
      dates,
      input.notes,
    ].join("\n"),
  );
}

function normalizedLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

export function detectDatingSafetyRedFlags(input: SafetyInput): RedFlag[] {
  const text = buildSafetyText(input);
  const flags: RedFlag[] = [];
  for (const rule of rules) {
    if (!rule.patterns.some((pattern) => pattern.test(text))) continue;
    flags.push({
      severity: rule.severity,
      label: rule.label,
      evidence: rule.evidence,
    });
  }
  return flags;
}

export function mergeSafetyRedFlags(
  aiFlags: RedFlag[],
  safetyFlags: RedFlag[],
): RedFlag[] {
  const seen = new Set<string>();
  const merged: RedFlag[] = [];
  for (const flag of [...safetyFlags, ...aiFlags]) {
    const label = normalizedLabel(flag.label);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    merged.push(flag);
  }
  return merged;
}
