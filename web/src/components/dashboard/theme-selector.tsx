"use client";

import { useSyncExternalStore } from "react";

import {
  getStoredTheme,
  setThemePreference,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/theme";

import { MoonIcon, SunIcon, SystemIcon } from "./icons";

const options: ReadonlyArray<{
  value: ThemePreference;
  label: string;
  icon: typeof SystemIcon;
}> = [
  { value: "system", label: "端末設定", icon: SystemIcon },
  { value: "light", label: "ライト", icon: SunIcon },
  { value: "dark", label: "ダーク", icon: MoonIcon },
];

export function ThemeSelector({ className }: { className?: string }) {
  const preference = useSyncExternalStore(
    (onStoreChange) => {
      const handleStorage = (event: StorageEvent) => {
        if (event.key === THEME_STORAGE_KEY) {
          onStoreChange();
        }
      };
      const handleThemeChange = () => onStoreChange();

      window.addEventListener("storage", handleStorage);
      window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
      return () => {
        window.removeEventListener("storage", handleStorage);
        window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
      };
    },
    () => getStoredTheme(window.localStorage),
    () => "system" satisfies ThemePreference,
  );

  return (
    <fieldset className={className} data-theme-selector>
      <legend className="sr-only">表示テーマ</legend>
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <label key={option.value} title={option.label}>
            <input
              checked={preference === option.value}
              name="ambient-lapis-theme"
              onChange={() => setThemePreference(option.value)}
              type="radio"
              value={option.value}
            />
            <span>
              <Icon />
              <span className="sr-only">{option.label}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
