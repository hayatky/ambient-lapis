import { expect, test } from "@playwright/test";

import { setScenario } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

test.describe("theme and accessibility", () => {
  test.beforeEach(async ({ request }) => {
    await setScenario(request, "normal");
  });

  test("theme selection persists across reloads", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("radio", { name: "ダーク" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("radio", { name: "ダーク" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await page.getByRole("radio", { name: "自動" }).click();
  });

  test("renders correctly with reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator("canvas").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/収集正常/)).toBeVisible();
  });

  test("the chart provides a keyboard-reachable text summary", async ({
    page,
  }) => {
    await page.goto("/");
    const summary = page.getByLabel("グラフのテキスト要約");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("温度: 最低");
    await expect(summary).toContainText("湿度: 最低");
    await summary.focus();
    await expect(summary).toBeFocused();
  });

  test("the theme toggle is keyboard operable", async ({ page }) => {
    await page.goto("/");
    const auto = page.getByRole("radio", { name: "自動" });
    await expect(auto).toBeEnabled();
    await auto.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("radio", { name: "ライト" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    // Restore the default preference.
    await page.getByRole("radio", { name: "自動" }).click();
  });
});
