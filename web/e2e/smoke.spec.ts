import { expect, test } from "@playwright/test";

import { collectPageErrors, setScenario } from "./helpers";

test.describe("smoke", () => {
  test("renders the dashboard without console errors", async ({
    page,
    request,
  }) => {
    await setScenario(request, "normal");
    const errors = collectPageErrors(page);

    await page.goto("/");
    await expect(page).toHaveTitle("Ambient Lapis");
    await expect(page.getByText("温度", { exact: true })).toBeVisible();
    await expect(page.getByText("湿度", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "エアコン - Nature Remo認識状態" }),
    ).toBeVisible();
    await expect(
      page.getByText("エアコン本体との双方向確認ではありません"),
    ).toBeVisible();
    // The lazily loaded chart eventually renders a canvas.
    await expect(page.locator("canvas").first()).toBeVisible({
      timeout: 15_000,
    });

    expect(errors).toEqual([]);
  });
});
