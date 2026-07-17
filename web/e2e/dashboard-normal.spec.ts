import { expect, test, type Page } from "@playwright/test";

import { collectPageErrors, setScenario } from "./helpers";

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

async function expectCoreContent(page: Page): Promise<void> {
  await expect(
    page.getByText("計測時刻", { exact: false }).first(),
  ).toBeVisible();
  await expect(page.getByText(/収集正常/)).toBeVisible();
  await expect(
    page.getByRole("region", { name: "エアコン - Nature Remo認識状態" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "日次サマリー" }),
  ).toBeVisible();
  await expect(page.locator("canvas").first()).toBeVisible({
    timeout: 15_000,
  });
}

for (const viewport of VIEWPORTS) {
  test(`renders the normal dashboard on ${viewport.name}`, async ({
    page,
    request,
  }) => {
    await setScenario(request, "normal");
    const errors = collectPageErrors(page);
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.goto("/");
    await expectCoreContent(page);

    const history = page.getByRole("region", { name: "温度と湿度の履歴" });
    const aircon = page.getByRole("region", {
      name: "エアコン - Nature Remo認識状態",
    });
    const historyBox = await history.boundingBox();
    const airconBox = await aircon.boundingBox();
    expect(historyBox).not.toBeNull();
    expect(airconBox).not.toBeNull();
    if (historyBox && airconBox) {
      if (viewport.name === "mobile") {
        // Mobile order (§9.2): history section above the aircon card.
        expect(historyBox.y).toBeLessThan(airconBox.y);
      } else {
        // Tablet and desktop: aircon sits in the top row, history below.
        expect(airconBox.y).toBeLessThan(historyBox.y);
      }
    }
    expect(errors).toEqual([]);
  });
}

test("renders both themes on desktop", async ({ page, request }) => {
  await setScenario(request, "normal");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page.getByRole("radio", { name: "ダーク" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByText(/収集正常/)).toBeVisible();

  await page.getByRole("radio", { name: "ライト" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByText(/収集正常/)).toBeVisible();
});
