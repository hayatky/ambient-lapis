import {
  applyThemePreference,
  getStoredTheme,
  resolveTheme,
  setThemePreference,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
} from "./theme";

describe("theme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("style");
  });

  it("defaults invalid stored values to system", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    expect(getStoredTheme(window.localStorage)).toBe("system");
  });

  it("resolves the system preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("applies the resolved theme to the document", () => {
    expect(applyThemePreference("system", true)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("persists and announces theme changes", () => {
    const listener = vi.fn();
    window.addEventListener(THEME_CHANGE_EVENT, listener);

    setThemePreference("light");

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(THEME_CHANGE_EVENT, listener);
  });
});
