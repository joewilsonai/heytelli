import { Platform } from "react-native";

import {
  sanitizeCircleContact,
  type TrustedCirclePerson,
} from "./user-settings.ts";

type ContactModule = typeof import("expo-contacts");
type MetroRequire = (moduleName: string) => unknown;

declare const require: MetroRequire;

function getPhoneNumber(details: any): string | null {
  const phones = details?.phones ?? details?.phoneNumbers ?? [];
  const first = Array.isArray(phones) ? phones[0] : null;
  return first?.number ?? first?.digits ?? null;
}

function getFullName(details: any): string {
  return (
    details?.fullName ??
    [details?.givenName, details?.familyName].filter(Boolean).join(" ") ??
    ""
  );
}

export async function pickTrustedCircleContact(options: {
  storePhone?: boolean;
}): Promise<
  | { status: "picked"; person: TrustedCirclePerson }
  | { status: "cancelled" }
  | { status: "unavailable"; message: string }
> {
  let Contacts: ContactModule;
  try {
    Contacts = require("expo-contacts") as ContactModule;
  } catch {
    return {
      status: "unavailable",
      message: "Contacts support needs a new HeyTelli dev build.",
    };
  }

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
        phoneNumber: getPhoneNumber(contact),
      },
      { storePhone: options.storePhone, source: "contacts" },
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
