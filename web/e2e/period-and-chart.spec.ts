import { expect, test } from "@playwright/test";

import { setScenario } from "./helpers";

test.describe("period selection and chart", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ request }) => {
    await setScenario(request, "normal");
  });

  test("switching presets refetches history with resolution=auto", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("canvas").first()).toBeVisible({
      timeout: 15_000,
    });

    const seriesRequest = page.waitForRequest((request) =>
      request.url().includes("/api/v1/environment/series"),
    );
    await page.getByRole("radio", { name: "7日" }).click();
    const request = await seriesRequest;
    expect(request.url()).toContain("resolution=auto");
    await expect(page.getByRole("radio", { name: "7日" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test("custom period rejects a future end date", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("radio", { name: "任意" }).click();

    const from = page.getByLabel("開始日");
    const to = page.getByLabel("終了日");
    // The max attribute prevents future dates from the picker; force a
    // future value programmatically to verify the re-validation.
    await from.fill("2026-07-01");
    await to.evaluate((element: HTMLInputElement) => {
      element.removeAttribute("max");
    });
    await to.fill("2099-01-01");
    await page.getByRole("button", { name: "適用" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "終了日" }),
    ).toHaveText("終了日に未来の日付は指定できません。");
  });

  test("custom period applies a valid JST day range", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("radio", { name: "任意" }).click();
    await page.getByLabel("開始日").fill("2026-07-14");
    await page.getByLabel("終了日").fill("2026-07-16");

    const seriesRequest = page.waitForRequest((request) =>
      request.url().includes("/api/v1/environment/series"),
    );
    await page.getByRole("button", { name: "適用" }).click();
    const request = await seriesRequest;
    expect(decodeURIComponent(request.url())).toContain(
      "from=2026-07-13T15:00:00.000Z",
    );
  });

  test("the period selector is keyboard operable", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("radio", { name: "24時間" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("radio", { name: "7日" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.getByRole("radio", { name: "7日" })).toBeFocused();
  });
});

test.describe("chart tooltip on touch", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test.beforeEach(async ({ request }) => {
    await setScenario(request, "normal");
  });

  test("tapping the chart pins a tooltip on mobile", async ({ page }) => {
    await page.goto("/");
    const chart = page.getByRole("img", {
      name: /温度と湿度の履歴グラフ/,
    });
    await expect(chart.locator("canvas")).toBeVisible({ timeout: 15_000 });
    await chart.tap({ position: { x: 200, y: 120 } });
    // The ECharts tooltip is rendered as a DOM node inside the container.
    await expect(chart.getByText(/温度/).first()).toBeVisible();
  });
});
