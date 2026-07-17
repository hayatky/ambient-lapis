import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ThemeProvider } from "@/components/theme-provider";
import { THEME_STORAGE_KEY } from "@/lib/theme";

import { ThemeToggle } from "./theme-toggle";

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("ThemeToggle", () => {
  it("reflects the stored preference after mount", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(<ThemeToggle />);
    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "ダーク" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
    });
  });

  it("stores the selection and applies the theme attribute", async () => {
    render(
      <>
        <ThemeProvider />
        <ThemeToggle />
      </>,
    );
    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "ライト" })).toBeEnabled();
    });
    await user.click(screen.getByRole("radio", { name: "ダーク" }));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    await user.click(screen.getByRole("radio", { name: "ライト" }));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("moves the selection with arrow keys", async () => {
    render(<ThemeToggle />);
    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "自動" })).toBeEnabled();
    });
    screen.getByRole("radio", { name: "自動" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });
});
