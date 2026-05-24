import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const DATE_DAY_PREFIX = "date-day-";

let configured = false;
function configureHandler() {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function ensureNotificationPermission(): Promise<boolean> {
  configureHandler();
  if (Platform.OS === "web") return false;
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  if (!existing.canAskAgain) return false;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

export async function scheduleDateDayReminder(
  matchId: number,
  name: string,
  dateAt: Date,
  location: string | null,
): Promise<string | null> {
  if (Platform.OS === "web") return null;
  const granted = await ensureNotificationPermission();
  if (!granted) return null;

  await cancelDateDayReminder(matchId);

  const trigger = new Date(dateAt);
  trigger.setHours(9, 0, 0, 0);
  if (trigger.getTime() <= Date.now() + 60_000) return null;

  const timeStr = dateAt.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const body = location
    ? `${timeStr} at ${location}. Tap to review your notes.`
    : `${timeStr}. Tap to review your notes.`;

  return await Notifications.scheduleNotificationAsync({
    identifier: DATE_DAY_PREFIX + matchId,
    content: {
      title: `Date with ${name} today`,
      body,
      data: { matchId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: trigger,
    },
  });
}

export async function cancelDateDayReminder(matchId: number): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await Notifications.cancelScheduledNotificationAsync(
      DATE_DAY_PREFIX + matchId,
    );
  } catch {
    // ignore — may not exist
  }
}
