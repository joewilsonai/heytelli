const PUBLIC_BEARER_URL_RE =
  /\bhttps?:\/\/(?=[^\s<>"'`]*?(?:access[_-]?token|auth[_-]?token|bearer|token=|signature=|signed|\/api\/storage\/objects\/))[^\s<>"'`]+/gi;
const BEARER_AUTH_RE = /\b(?:authorization\s*:\s*)?bearer\s+[a-z0-9._~+/=-]+/gi;

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function sanitizeSafetyShareText(
  value: string | null | undefined,
): string | null {
  const text = clean(value);
  if (!text) return null;

  const sanitized = text
    .replace(PUBLIC_BEARER_URL_RE, "[private link removed]")
    .replace(BEARER_AUTH_RE, "[private credential removed]")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.;:!?])/g, "$1")
    .trim();

  return sanitized ? sanitized : null;
}
