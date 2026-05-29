import * as Contacts from "expo-contacts";
import { Platform } from "react-native";

import {
  sanitizeCircleContact,
  type TrustedCirclePerson,
} from "./user-settings.ts";

function getFullName(details: any): string {
  return (
    details?.fullName ??
    [details?.givenName, details?.familyName].filter(Boolean).join(" ") ??
    ""
  );
}

export async function pickTrustedCircleContact(): Promise<
  | { status: "picked"; person: TrustedCirclePerson }
  | { status: "cancelled" }
  | { status: "unavailable"; message: string }
> {
  try {
    if (Platform.OS === "android") {
      return {
        status: "unavailable",
        message: "Use manual circle entry on Android for now.",
      };
    }
    const contact = await Contacts.presentContactPickerAsync();
    if (!contact) return { status: "cancelled" };
    const person = sanitizeCircleContact(
      {
        fullName: getFullName(contact),
      },
      { source: "contacts" },
    );
    return { status: "picked", person };
  } catch (error: any) {
    return {
      status: "unavailable",
      message:
        error?.message ??
        "Contacts are unavailable. You can still add a circle person manually.",
    };
  }
}
