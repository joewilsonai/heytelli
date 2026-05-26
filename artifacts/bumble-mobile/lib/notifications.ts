import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const DATE_DAY_PREFIX = "date-day-";
const DATE_CHECK_IN_PREFIX = "date-check-in-";
const DATE_EXPECTED_END_PREFIX = "date-expected-end-";

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

async function scheduleDateSafetyNotification(input: {
  identifier: string;
  title: string;
  body: string;
  date: Date;
  matchId: number;
}): Promise<string | null> {
  if (Platform.OS === "web") return null;
  const granted = await ensureNotificationPermission();
  if (!granted) return null;
  if (input.date.getTime() <= Date.now() + 60_000) return null;

  return await Notifications.scheduleNotificationAsync({
    identifier: input.identifier,
    content: {
      title: input.title,
      body: input.body,
      data: { matchId: input.matchId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: input.date,
    },
  });
}

export async function scheduleDateSafetyReminders(input: {
  matchId: number;
  name: string;
  checkInAt: Date | null;
  expectedEndAt: Date | null;
}): Promise<void> {
  await cancelDateSafetyReminders(input.matchId);

  await Promise.all([
    input.checkInAt
      ? scheduleDateSafetyNotification({
          identifier: DATE_CHECK_IN_PREFIX + input.matchId,
          title: `Check in from your date with ${input.name}`,
          body: "Tap HeyTelli and send your circle an I'm safe update.",
          date: input.checkInAt,
          matchId: input.matchId,
        })
      : Promise.resolve(null),
    input.expectedEndAt
      ? scheduleDateSafetyNotification({
          identifier: DATE_EXPECTED_END_PREFIX + input.matchId,
          title: `Date with ${input.name} should be wrapping up`,
          body: "Send your circle an update or use a soft exit if you need one.",
          date: input.expectedEndAt,
          matchId: input.matchId,
        })
      : Promise.resolve(null),
  ]);
}

export async function cancelDateSafetyReminders(
  matchId: number,
): Promise<void> {
  if (Platform.OS === "web") return;
  await Promise.all(
    [DATE_CHECK_IN_PREFIX, DATE_EXPECTED_END_PREFIX].map(async (prefix) => {
      try {
        await Notifications.cancelScheduledNotificationAsync(prefix + matchId);
      } catch {
        // ignore — may not exist
      }
    }),
  );
}
