export type CircleCardLabelPreference = "name" | "relationship";

export type CircleCardLabelPerson = {
  name: string;
  relationship?: string | null;
  cardLabelPreference?: CircleCardLabelPreference | null;
};

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function firstName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "Circle";
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

function looksLikeFullName(value: string): boolean {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return (
    words.length > 1 &&
    words.every((word) => /^[A-Z]/.test(word) || /^[A-Z][.'-]/.test(word))
  );
}

export function getCirclePersonCardLabel(
  person: CircleCardLabelPerson,
): string {
  const relationship = clean(person.relationship);
  if (person.cardLabelPreference === "relationship" && relationship) {
    return relationship;
  }
  return firstName(clean(person.name) ?? "Circle");
}

export function normalizeCircleCardPreference(
  value: unknown,
): CircleCardLabelPreference {
  return value === "relationship" ? "relationship" : "name";
}

export function circleLabelsFromPlanValue(
  value: string | null | undefined,
): string[] {
  const labels =
    clean(value)
      ?.split(",")
      .map((label) => {
        const trimmed = clean(label);
        if (!trimmed) return null;
        return looksLikeFullName(trimmed) ? firstName(trimmed) : trimmed;
      })
      .filter((label): label is string => label != null) ?? [];

  return Array.from(new Set(labels)).slice(0, 3);
}
