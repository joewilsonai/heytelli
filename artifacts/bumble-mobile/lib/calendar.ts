import * as Calendar from "expo-calendar";
import { Platform } from "react-native";

export async function addDateToCalendar(
  name: string,
  dateAt: Date,
  location: string | null,
  notes?: string,
): Promise<string | null> {
  if (Platform.OS === "web") return null;

  const perm = await Calendar.requestCalendarPermissionsAsync();
  if (!perm.granted) return null;

  let calendarId: string | null = null;

  if (Platform.OS === "ios") {
    const def = await Calendar.getDefaultCalendarAsync().catch(() => null);
    calendarId = def?.id ?? null;
  }

  if (!calendarId) {
    const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const writable = cals.find((c) => c.allowsModifications);
    calendarId = writable?.id ?? cals[0]?.id ?? null;
  }

  if (!calendarId) return null;

  const start = new Date(dateAt);
  const end = new Date(dateAt.getTime() + 2 * 60 * 60 * 1000);

  try {
    const id = await Calendar.createEventAsync(calendarId, {
      title: `Date with ${name}`,
      startDate: start,
      endDate: end,
      location: location ?? undefined,
      notes: notes ?? undefined,
      alarms: [{ relativeOffset: -60 }],
    });
    return id;
  } catch {
    return null;
  }
}
