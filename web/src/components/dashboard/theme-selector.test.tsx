import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { THEME_STORAGE_KEY } from "@/lib/theme";

import { ThemeSelector } from "./theme-selector";

describe("ThemeSelector", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("exposes a named radio group and restores the stored preference", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(<ThemeSelector />);

    expect(
      screen.getByRole("group", { name: "表示テーマ" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "端末設定" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "ライト" })).not.toBeChecked();
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "ダーク" })).toBeChecked(),
    );
  });

  it("supports native arrow-key selection and persists the new theme", async () => {
    const user = userEvent.setup();
    render(<ThemeSelector />);

    const system = screen.getByRole("radio", { name: "端末設定" });
    const light = screen.getByRole("radio", { name: "ライト" });
    const dark = screen.getByRole("radio", { name: "ダーク" });
    await waitFor(() => expect(system).toBeChecked());

    system.focus();
    await user.keyboard("{ArrowRight}");
    expect(light).toBeChecked();
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");

    await user.keyboard("{ArrowRight}");
    expect(dark).toBeChecked();
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });
});
