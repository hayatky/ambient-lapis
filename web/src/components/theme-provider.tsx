"use client";

import { useEffect } from "react";

import {
  applyThemePreference,
  getStoredTheme,
  isThemePreference,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/theme";

const DARK_MODE_QUERY = "(prefers-color-scheme: dark)";

export function ThemeProvider(): null {
  useEffect(() => {
    const mediaQuery = window.matchMedia(DARK_MODE_QUERY);

    const apply = (preference: ThemePreference) => {
      applyThemePreference(preference, mediaQuery.matches);
    };

    const applyStored = () => apply(getStoredTheme(window.localStorage));

    const handleSystemChange = () => {
      if (getStoredTheme(window.localStorage) === "system") {
        applyStored();
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) {
        applyStored();
      }
    };

    const handleThemeChange = (event: Event) => {
      const preference = (event as CustomEvent<unknown>).detail;
      if (isThemePreference(preference)) {
        apply(preference);
      }
    };

    applyStored();
    mediaQuery.addEventListener("change", handleSystemChange);
    window.addEventListener("storage", handleStorage);
    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);

    return () => {
      mediaQuery.removeEventListener("change", handleSystemChange);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    };
  }, []);

  return null;
}
