export const THEME_STORAGE_KEY = "ambient-lapis-theme";
export const THEME_CHANGE_EVENT = "ambient-lapis:theme-change";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = Exclude<ThemePreference, "system">;

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function getStoredTheme(
  storage: Pick<Storage, "getItem">,
): ThemePreference {
  const value = storage.getItem(THEME_STORAGE_KEY);
  return isThemePreference(value) ? value : "system";
}

export function resolveTheme(
  preference: ThemePreference,
  prefersDark: boolean,
): ResolvedTheme {
  return preference === "system"
    ? prefersDark
      ? "dark"
      : "light"
    : preference;
}

export function applyThemePreference(
  preference: ThemePreference,
  prefersDark: boolean,
  root: HTMLElement = document.documentElement,
): ResolvedTheme {
  const resolved = resolveTheme(preference, prefersDark);
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  return resolved;
}

export function setThemePreference(preference: ThemePreference): void {
  window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  window.dispatchEvent(
    new CustomEvent<ThemePreference>(THEME_CHANGE_EVENT, {
      detail: preference,
    }),
  );
}

export const themeInitializationScript = `(() => {
  const key = ${JSON.stringify(THEME_STORAGE_KEY)};
  const stored = localStorage.getItem(key);
  const preference = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
  const resolved = preference === "system" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : preference === "system" ? "light" : preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
})()`;
