export type ProductFeedbackInput = {
  event?: unknown;
  answer?: unknown;
  matchId?: unknown;
  context?: unknown;
};

export type NormalizedProductFeedback = {
  event: string;
  answer: string;
  matchId: number | null;
  context: Record<string, string>;
};

const ALLOWED_CONTEXT_KEYS = ["surface", "prompt", "choice"] as const;
const MAX_FIELD_LENGTH = 120;
const MAX_CONTEXT_LENGTH = 240;

function cleanText(
  value: unknown,
  maxLength = MAX_FIELD_LENGTH,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function cleanMatchId(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function cleanContext(value: unknown): Record<string, string> {
  const obj =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const context: Record<string, string> = {};
  for (const key of ALLOWED_CONTEXT_KEYS) {
    const text = cleanText(obj[key], MAX_CONTEXT_LENGTH);
    if (text) context[key] = text;
  }
  return context;
}

export function normalizeProductFeedback(
  input: ProductFeedbackInput,
): NormalizedProductFeedback | null {
  const event = cleanText(input.event);
  const answer = cleanText(input.answer);
  if (!event || !answer) return null;

  return {
    event,
    answer,
    matchId: cleanMatchId(input.matchId),
    context: cleanContext(input.context),
  };
}
