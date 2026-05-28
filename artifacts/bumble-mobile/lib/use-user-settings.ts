import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useContext, useEffect, useState } from "react";

import {
  DEFAULT_HEYTELLI_SETTINGS,
  mergeSettings,
  stripStoredCirclePhoneNumbers,
  type HeyTelliSettings,
} from "./user-settings.ts";

const SETTINGS_KEY = "heytelli:user-settings:v1";

type UserSettingsValue = {
  settings: HeyTelliSettings;
  setSettings: (
    next: HeyTelliSettings | ((current: HeyTelliSettings) => HeyTelliSettings),
  ) => Promise<HeyTelliSettings>;
  loading: boolean;
};

const UserSettingsContext = React.createContext<UserSettingsValue | null>(null);

function useUserSettingsState(): UserSettingsValue {
  const [settings, setSettingsState] = useState<HeyTelliSettings>(
    DEFAULT_HEYTELLI_SETTINGS,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(SETTINGS_KEY)
      .then((raw) => {
        if (!alive) return;
        if (!raw) {
          setSettingsState(DEFAULT_HEYTELLI_SETTINGS);
          return;
        }
        const parsed = mergeSettings(JSON.parse(raw));
        const privacySafe = parsed.dateSafetyDefaults.storePhone
          ? parsed
          : stripStoredCirclePhoneNumbers(parsed);
        setSettingsState(privacySafe);
        if (!parsed.dateSafetyDefaults.storePhone) {
          AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(privacySafe)).catch(
            () => {},
          );
        }
      })
      .catch(() => {
        if (alive) setSettingsState(DEFAULT_HEYTELLI_SETTINGS);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const setSettings = useCallback(
    async (
      next:
        | HeyTelliSettings
        | ((current: HeyTelliSettings) => HeyTelliSettings),
    ) => {
      const resolved = mergeSettings(
        typeof next === "function" ? next(settings) : next,
      );
      const privacySafe = resolved.dateSafetyDefaults.storePhone
        ? resolved
        : stripStoredCirclePhoneNumbers(resolved);
      setSettingsState(privacySafe);
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(privacySafe));
      return privacySafe;
    },
    [settings],
  );

  return { settings, setSettings, loading };
}

export function UserSettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const value = useUserSettingsState();
  return React.createElement(UserSettingsContext.Provider, { value }, children);
}

export function useUserSettings(): UserSettingsValue {
  const context = useContext(UserSettingsContext);
  if (!context) {
    throw new Error("useUserSettings must be used within UserSettingsProvider");
  }
  return context;
}
