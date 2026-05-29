import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  buildLocalDateCardShareEvent,
  upsertLocalDateCardEvent,
  type DateCardEventMatch,
  type LocalDateCardEvent,
} from "./date-card-events.ts";

export const LOCAL_DATE_CARD_EVENT_STORAGE_KEY =
  "heytelli:local-date-card-events:v1";

export type LocalDateCardEventMap = Record<string, LocalDateCardEvent[]>;

function matchKey(matchId: number | string): string {
  return String(matchId);
}

function cleanEvent(value: unknown): LocalDateCardEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    input.type !== "date_card_shared" ||
    typeof input.clientDateId !== "string" ||
    typeof input.idempotencyKey !== "string" ||
    typeof input.occurredAt !== "string" ||
    !input.metadata ||
    typeof input.metadata !== "object" ||
    Array.isArray(input.metadata)
  ) {
    return null;
  }
  const metadata = input.metadata as Record<string, unknown>;
  return {
    type: "date_card_shared",
    clientDateId: input.clientDateId,
    idempotencyKey: input.idempotencyKey,
    occurredAt: input.occurredAt,
    metadata: {
      hasCheckIn: metadata.hasCheckIn === true,
      hasExpectedEnd: metadata.hasExpectedEnd === true,
      safeDateChecklistReady: metadata.safeDateChecklistReady === true,
      circleContactCount:
        typeof metadata.circleContactCount === "number" &&
        Number.isFinite(metadata.circleContactCount)
          ? Math.max(0, Math.min(3, Math.round(metadata.circleContactCount)))
          : 0,
      shareLiveLocation: metadata.shareLiveLocation === true,
    },
  };
}

export async function readLocalDateCardEvents(): Promise<LocalDateCardEventMap> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_DATE_CARD_EVENT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const events: LocalDateCardEventMap = {};
    for (const [matchId, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) continue;
      const cleaned = value
        .map(cleanEvent)
        .filter((event): event is LocalDateCardEvent => event != null);
      if (cleaned.length > 0) events[matchId] = cleaned;
    }
    return events;
  } catch {
    return {};
  }
}

async function writeLocalDateCardEvents(
  events: LocalDateCardEventMap,
): Promise<void> {
  await AsyncStorage.setItem(
    LOCAL_DATE_CARD_EVENT_STORAGE_KEY,
    JSON.stringify(events),
  );
}

export async function recordLocalDateCardShareEvent(
  matchId: number | string,
  match: DateCardEventMatch,
): Promise<LocalDateCardEvent> {
  const key = matchKey(matchId);
  const events = await readLocalDateCardEvents();
  const event = buildLocalDateCardShareEvent(match);
  await writeLocalDateCardEvents({
    ...events,
    [key]: upsertLocalDateCardEvent(events[key] ?? [], event),
  });
  return event;
}
