import { expect, test } from "@playwright/test";

import { setScenario } from "./helpers";

test.use({ viewport: { width: 1440, height: 900 } });

test.describe("dashboard states", () => {
  test("noData shows the waiting message without fake numbers", async ({
    page,
    request,
  }) => {
    await setScenario(request, "noData");
    await page.goto("/");
    await expect(page.getByText("収集データはまだありません")).toBeVisible();
    await expect(
      page.getByText("エアコンの認識状態はまだ取得できていません。"),
    ).toBeVisible();
    await expect(
      page.getByText("日次サマリーはまだありません。"),
    ).toBeVisible();
  });

  test("collectionStopped shows a danger warning and keeps last values", async ({
    page,
    request,
  }) => {
    await setScenario(request, "collectionStopped");
    await page.goto("/");
    const banner = page.getByText("データ収集が停止しています");
    await expect(banner).toBeVisible();
    await expect(page.getByText(/収集停止/)).toBeVisible();
    await expect(
      page.getByText(/最終取得から時間が経過しています/),
    ).toBeVisible();
    // Last known numbers stay on screen (large metric figure present).
    await expect(page.locator(".hero-figure").first()).not.toHaveText("--");
  });

  test("remoOffline warns that values may not be current", async ({
    page,
    request,
  }) => {
    await setScenario(request, "remoOffline");
    await page.goto("/");
    await expect(page.getByText("Nature Remoがオフラインです")).toBeVisible();
    await expect(
      page.getByText(/現在値ではない可能性があります/).first(),
    ).toBeVisible();
  });

  test("temperatureStale marks only the stale metric", async ({
    page,
    request,
  }) => {
    await setScenario(request, "temperatureStale");
    await page.goto("/");
    await expect(
      page.getByText("温度の計測値が更新されていません").first(),
    ).toBeVisible();
    await expect(
      page.getByText("湿度の計測値が更新されていません"),
    ).toHaveCount(0);
  });

  test("airconUnknown never guesses on or off", async ({ page, request }) => {
    await setScenario(request, "airconUnknown");
    await page.goto("/");
    await expect(page.getByText("エアコンの認識状態が不明です")).toBeVisible();
    const aircon = page.getByRole("region", {
      name: "エアコン - Nature Remo認識状態",
    });
    await expect(
      aircon.getByText("不明", { exact: true }).first(),
    ).toBeVisible();
    await expect(aircon.getByText("運転中")).toHaveCount(0);
    await expect(aircon.getByText("停止", { exact: true })).toHaveCount(0);
  });

  test("partial failure keeps the successful half visible", async ({
    page,
    request,
  }) => {
    await setScenario(request, "partialEnvironmentOnly");
    await page.goto("/");
    await expect(
      page.getByText("一部のデータを取得できませんでした"),
    ).toBeVisible();
    await expect(page.locator(".hero-figure").first()).toBeVisible();
    await expect(
      page.getByText("エアコンの認識状態はまだ取得できていません。"),
    ).toBeVisible();
  });

  test("fullError renders the shell and recovers via retry", async ({
    page,
    request,
  }) => {
    await setScenario(request, "fullError");
    await page.goto("/");
    await expect(
      page.getByText("ダッシュボードのデータを取得できませんでした"),
    ).toBeVisible();

    await setScenario(request, "normal");
    await page.getByRole("button", { name: "再試行" }).click();
    await expect(page.locator(".hero-figure").first()).toBeVisible();
    await expect(page.getByText(/収集正常/)).toBeVisible();
  });

  test("historyError stays inside the history section and retries", async ({
    page,
    request,
  }) => {
    await setScenario(request, "historyError");
    await page.goto("/");
    // Current values render normally.
    await expect(page.locator(".hero-figure").first()).toBeVisible();
    const history = page.getByRole("region", { name: "温度と湿度の履歴" });
    await expect(
      history.getByText("履歴データを取得できませんでした"),
    ).toBeVisible();

    await setScenario(request, "normal");
    await history.getByRole("button", { name: "再試行" }).click();
    await expect(history.locator("canvas").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("never labels the aircon as the machine's actual state", async ({
    page,
    request,
  }) => {
    await setScenario(request, "normal");
    await page.goto("/");
    await expect(page.getByText(/実機状態/)).toHaveCount(0);
  });
});
