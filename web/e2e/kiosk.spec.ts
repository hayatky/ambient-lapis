import { expect, test, type Page } from "@playwright/test";

import { collectPageErrors, setScenario } from "./helpers";

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

async function enableMockFullscreen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Document.prototype, "fullscreenEnabled", {
      configurable: true,
      get: () => true,
    });
    Object.defineProperty(Document.prototype, "fullscreenElement", {
      configurable: true,
      get: () => null,
    });
    Element.prototype.requestFullscreen = async function requestFullscreen() {
      const target = window as typeof window & { fullscreenRequests?: number };
      target.fullscreenRequests = (target.fullscreenRequests ?? 0) + 1;
    };
  });
}

async function expectNoDocumentOverflow(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        horizontal:
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
        vertical:
          document.documentElement.scrollHeight <=
          document.documentElement.clientHeight,
      })),
    )
    .toEqual({ horizontal: true, vertical: true });
}

async function expectKioskSurface(page: Page): Promise<void> {
  await expect(page.locator("main.kiosk")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "現在の室内環境" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", {
      name: "エアコン - Nature Remo認識状態",
    }),
  ).toBeVisible();
  const chart = page.getByRole("img", {
    name: /温度、湿度、Nature Remo認識エアコン設定温度/,
  });
  await expect(chart).toBeVisible();
  await expect(chart.locator("canvas")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("収集正常", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "24時間" })).toBeVisible();
  await expect(page.getByRole("button", { name: "7日" })).toBeVisible();
  await expect(page.getByRole("button", { name: "30日" })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "テーマ" })).toBeVisible();
  await expect(page.getByRole("button", { name: "全画面" })).toBeVisible();
  await expect(page.getByRole("link", { name: "通常表示" })).toBeVisible();
}

for (const viewport of VIEWPORTS) {
  test(`fits the complete kiosk surface in the ${viewport.name} viewport`, async ({
    page,
    request,
  }) => {
    await setScenario(request, "normal");
    await page.setViewportSize(viewport);
    await enableMockFullscreen(page);
    const errors = collectPageErrors(page);

    await page.goto("/kiosk");
    await expectKioskSurface(page);
    await expectNoDocumentOverflow(page);

    const kioskBox = await page.locator("main.kiosk").boundingBox();
    expect(kioskBox).not.toBeNull();
    if (kioskBox) {
      expect(kioskBox.width).toBeLessThanOrEqual(viewport.width);
      expect(kioskBox.height).toBeLessThanOrEqual(viewport.height);
    }
    expect(errors).toEqual([]);
  });
}

test.describe("kiosk navigation and controls", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ request }) => {
    await setScenario(request, "normal");
  });

  test("normal and kiosk views link to each other", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "キオスク表示" }).click();
    await expect(page).toHaveURL(/\/kiosk$/);
    await expect(page.locator("main.kiosk")).toBeVisible();

    await page.getByRole("link", { name: "通常表示" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("region", { name: "日次サマリー" }),
    ).toBeVisible();
  });

  test("starts at 24 hours and switches to 7 and 30 days", async ({ page }) => {
    await page.goto("/kiosk");
    await expect(page.getByRole("button", { name: "24時間" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    for (const name of ["7日", "30日"] as const) {
      const seriesRequest = page.waitForRequest((request) =>
        request.url().includes("/api/v1/environment/series"),
      );
      await page.getByRole("button", { name }).click();
      const request = await seriesRequest;
      expect(request.url()).toContain("resolution=auto");
      await expect(page.getByRole("button", { name })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
  });

  test("shares the persisted theme preference", async ({ page }) => {
    await page.goto("/kiosk");
    await page.getByRole("radio", { name: "ダーク" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("radio", { name: "自動" }).click();
  });

  test("requests fullscreen only from the visible user control", async ({
    page,
  }) => {
    await enableMockFullscreen(page);
    await page.goto("/kiosk");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as typeof window & { fullscreenRequests?: number })
              .fullscreenRequests ?? 0,
        ),
      )
      .toBe(0);
    await page.getByRole("button", { name: "全画面" }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as typeof window & { fullscreenRequests?: number })
              .fullscreenRequests ?? 0,
        ),
      )
      .toBe(1);
  });

  test("hides fullscreen when the browser does not support it", async ({
    page,
  }) => {
    await page.goto("/kiosk");
    await expect(page.getByRole("button", { name: "全画面" })).toHaveCount(0);
  });
});

test.describe("kiosk chart details", () => {
  test("fine pointer hover and keyboard arrows show the selected time", async ({
    page,
    request,
  }) => {
    await setScenario(request, "normal");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/kiosk");
    const chart = page.getByRole("img", {
      name: /温度、湿度、Nature Remo認識エアコン設定温度/,
    });
    await expect(chart.locator("canvas")).toBeVisible({ timeout: 15_000 });

    const box = await chart.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      await page.mouse.move(
        box.x + box.width * 0.52,
        box.y + box.height * 0.55,
      );
    }
    await expect(
      page.getByRole("region", { name: "選択時刻の詳細" }),
    ).toBeVisible();

    await chart.focus();
    await page.keyboard.press("ArrowRight");
    const detail = page.getByRole("region", { name: "選択時刻の詳細" });
    await expect(detail).toContainText("温度");
    await expect(detail).toContainText("湿度");
    await expect(detail).toContainText("エアコン認識");
    await page.keyboard.press("Escape");
    await expect(detail).toHaveCount(0);
  });

  test.describe("coarse pointer", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test("tap pins details until the close control is used", async ({
      page,
      request,
    }) => {
      await setScenario(request, "normal");
      await page.goto("/kiosk");
      const chart = page.getByRole("img", {
        name: /温度、湿度、Nature Remo認識エアコン設定温度/,
      });
      await expect(chart.locator("canvas")).toBeVisible({ timeout: 15_000 });
      await chart.tap({ position: { x: 200, y: 420 } });
      const detail = page.getByRole("region", { name: "選択時刻の詳細" });
      await expect(detail).toBeVisible();
      await detail.getByRole("button", { name: "詳細を閉じる" }).click();
      await expect(detail).toHaveCount(0);
    });
  });
});

test.describe("kiosk states", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  const states = [
    ["collectionStopped", "データ収集が停止しています"],
    ["remoOffline", "Nature Remoがオフラインです"],
  ] as const;

  for (const [scenario, message] of states) {
    test(`${scenario} remains visible without losing the chart`, async ({
      page,
      request,
    }) => {
      await setScenario(request, scenario);
      await page.goto("/kiosk");
      await expect(page.getByText(message, { exact: false })).toBeVisible();
      await expect(page.locator("main.kiosk")).toHaveClass(/kiosk-danger/);
      await expect(page.locator("canvas").first()).toBeVisible({
        timeout: 15_000,
      });
    });
  }

  test("unknown aircon state is not guessed", async ({ page, request }) => {
    await setScenario(request, "airconUnknown");
    await page.goto("/kiosk");
    const aircon = page.getByRole("region", {
      name: "エアコン - Nature Remo認識状態",
    });
    await expect(aircon.getByText("不明", { exact: true })).toBeVisible();
    await expect(aircon.getByText("運転中", { exact: true })).toHaveCount(0);
    await expect(aircon.getByText("停止", { exact: true })).toHaveCount(0);
  });

  test("no current data uses placeholders rather than invented values", async ({
    page,
    request,
  }) => {
    await setScenario(request, "noData");
    await page.goto("/kiosk");
    const current = page.getByRole("region", { name: "現在の室内環境" });
    await expect(current).toContainText("--");
    await expect(
      page.getByRole("region", {
        name: "エアコン - Nature Remo認識状態",
      }),
    ).toContainText("データなし");
  });

  test("history error is contained and can retry", async ({
    page,
    request,
  }) => {
    await setScenario(request, "historyError");
    await page.goto("/kiosk");
    const historyAlert = page
      .getByRole("alert")
      .filter({ hasText: "履歴更新失敗" });
    await expect(historyAlert).toBeVisible();
    await expect(
      historyAlert.getByRole("button", { name: "再試行" }),
    ).toBeVisible();
    await expect(
      page.getByText("表示できる履歴はまだありません"),
    ).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);

    await setScenario(request, "normal");
    await historyAlert.getByRole("button", { name: "再試行" }).click();
    await expect(page.locator("canvas").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("uses the concise Remo label without the long dashboard note", async ({
    page,
    request,
  }) => {
    await setScenario(request, "normal");
    await page.goto("/kiosk");
    await expect(page.getByText("NATURE REMO認識")).toBeVisible();
    await expect(
      page.getByText("エアコン本体との双方向確認ではありません"),
    ).toHaveCount(0);
  });
});
