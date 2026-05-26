export type ImportRouteMatch = {
  id: number;
  name: string;
  status: string;
};

export type ImportTargetResolution =
  | { mode: "new"; candidates: [] }
  | { mode: "existing"; match: ImportRouteMatch; candidates: ImportRouteMatch[] }
  | { mode: "ambiguous"; candidates: ImportRouteMatch[] };

const GENERIC_NAMES = new Set([
  "match",
  "new",
  "new match",
  "new connection",
  "unknown",
  "unknown match",
]);

function normalizeName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function firstNameKey(value: string | null | undefined): string | null {
  const normalized = normalizeName(value);
  if (!normalized || GENERIC_NAMES.has(normalized)) return null;
  const [first] = normalized.split(/[\s-]+/);
  return first && !GENERIC_NAMES.has(first) ? first : null;
}

export function resolveImportTarget(
  extractedName: string | null | undefined,
  matches: ImportRouteMatch[],
): ImportTargetResolution {
  const key = firstNameKey(extractedName);
  if (!key) return { mode: "new", candidates: [] };

  const candidates = matches.filter(
    (match) => match.status === "active" && firstNameKey(match.name) === key,
  );

  if (candidates.length === 1) {
    return { mode: "existing", match: candidates[0], candidates };
  }

  if (candidates.length > 1) {
    return { mode: "ambiguous", candidates };
  }

  return { mode: "new", candidates: [] };
}
