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

function simpleDock(page: Page) {
  return page.getByTestId("simple-header-menu");
}

async function expectSimpleDockHidden(page: Page): Promise<void> {
  await expect(simpleDock(page)).toHaveAttribute("data-menu-visible", "false");
}

async function revealSimpleDock(page: Page): Promise<void> {
  const root = page.getByTestId("simple-root");
  await expect(root).toBeVisible();
  await expect(page.locator("canvas").first()).toBeVisible({
    timeout: 15_000,
  });
  await root.hover({ position: { x: 8, y: 8 } });
  await expect(simpleDock(page)).toHaveAttribute("data-menu-visible", "true", {
    timeout: 1_000,
  });
}

async function expectSimpleDockGeometry(
  page: Page,
  viewport: (typeof VIEWPORTS)[number],
): Promise<void> {
  const dock = simpleDock(page);
  const header = page.getByTestId("simple-header");
  const current = page.getByRole("region", { name: "現在の室内環境" });
  const aircon = page.getByRole("region", {
    name: "エアコン - Nature Remo認識状態",
  });
  const chart = page.getByRole("img", {
    name: /温度、湿度、Nature Remo認識エアコン設定温度/,
  });
  const [dockBox, headerBox, currentBox, airconBox, chartBox] =
    await Promise.all([
      dock.boundingBox(),
      header.boundingBox(),
      current.boundingBox(),
      aircon.boundingBox(),
      chart.boundingBox(),
    ]);
  expect(dockBox).not.toBeNull();
  expect(headerBox).not.toBeNull();
  expect(currentBox).not.toBeNull();
  expect(airconBox).not.toBeNull();
  expect(chartBox).not.toBeNull();
  if (!dockBox || !headerBox || !currentBox || !airconBox || !chartBox) return;

  const dockRight = dockBox.x + dockBox.width;
  const dockBottom = dockBox.y + dockBox.height;
  const chartAxisBandTop = chartBox.y + chartBox.height * 0.78;

  expect(dockBox.x).toBeGreaterThanOrEqual(0);
  expect(dockBox.y).toBeGreaterThanOrEqual(0);
  expect(dockRight).toBeLessThanOrEqual(viewport.width);
  expect(dockBottom).toBeLessThanOrEqual(viewport.height);
  expect(dockBox.y).toBeLessThan(viewport.height / 2);
  // The header's responsive horizontal padding is 20/32/48px; allow an 8px
  // visual tolerance while still requiring the dock to be right aligned.
  const headerPadding =
    viewport.width >= 1024 ? 48 : viewport.width >= 640 ? 32 : 20;
  expect(dockRight).toBeGreaterThanOrEqual(viewport.width - headerPadding - 8);
  expect(dockBottom).toBeLessThan(chartAxisBandTop);

  const overlaps = (
    first: NonNullable<typeof dockBox>,
    second: NonNullable<typeof dockBox>,
  ): boolean =>
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y;
  expect(overlaps(dockBox, currentBox)).toBe(false);
  expect(overlaps(dockBox, airconBox)).toBe(false);

  const flatStyle = await dock.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderTopWidth: style.borderTopWidth,
      borderRightWidth: style.borderRightWidth,
      borderBottomWidth: style.borderBottomWidth,
      borderLeftWidth: style.borderLeftWidth,
      borderRadius: style.borderRadius,
    };
  });
  expect(flatStyle).toEqual({
    backgroundColor: "rgba(0, 0, 0, 0)",
    borderTopWidth: "0px",
    borderRightWidth: "0px",
    borderBottomWidth: "0px",
    borderLeftWidth: "0px",
    borderRadius: "0px",
  });
  await expect(dock.getByText("収集正常", { exact: false })).toHaveCount(0);
}

async function expectSimpleSurface(page: Page): Promise<void> {
  await expect(page.locator("main.simple")).toBeVisible();
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
  await expectSimpleDockHidden(page);
  await revealSimpleDock(page);
  await expect(page.getByRole("button", { name: "24時間" })).toHaveText("24h");
  await expect(page.getByRole("button", { name: "7日" })).toHaveText("7d");
  await expect(page.getByRole("button", { name: "30日" })).toHaveText("30d");
  await expect(page.getByTestId("simple-theme-trigger")).toBeVisible();
  await expect(
    page.getByTestId("simple-theme-trigger").locator("svg"),
  ).toHaveCount(1);
  await expect(page.getByRole("button", { name: "全画面" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "全画面" }).locator("svg"),
  ).toHaveCount(1);
  await expect(page.getByRole("link", { name: "通常表示" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "通常表示" }).locator("svg"),
  ).toHaveCount(1);
  await expect(page.getByText("収集正常", { exact: false })).toHaveCount(0);

  const brand = page.getByText("Ambient Lapis", { exact: true });
  if (viewportWidth(page) < 640) {
    await expect
      .poll(() =>
        brand.evaluate((element) => getComputedStyle(element).opacity),
      )
      .toBe("0");
  } else {
    await expect(brand).toBeVisible();
  }
}

function viewportWidth(page: Page): number {
  return page.viewportSize()?.width ?? 0;
}

for (const viewport of VIEWPORTS) {
  test(`fits the complete simple surface in the ${viewport.name} viewport`, async ({
    page,
    request,
  }) => {
    await setScenario(request, "normal");
    await page.setViewportSize(viewport);
    await enableMockFullscreen(page);
    const errors = collectPageErrors(page);

    await page.goto("/simple");
    await expectSimpleSurface(page);
    await expectSimpleDockGeometry(page, viewport);
    await expectNoDocumentOverflow(page);

    const simpleBox = await page.locator("main.simple").boundingBox();
    expect(simpleBox).not.toBeNull();
    if (simpleBox) {
      expect(simpleBox.width).toBeLessThanOrEqual(viewport.width);
      expect(simpleBox.height).toBeLessThanOrEqual(viewport.height);
    }
    expect(errors).toEqual([]);
  });
}

test.describe("simple navigation and controls", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ request }) => {
    await setScenario(request, "normal");
  });

  test("normal and simple views link to each other", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "シンプル表示" }).click();
    await expect(page).toHaveURL(/\/simple$/);
    await expect(page.locator("main.simple")).toBeVisible();

    await revealSimpleDock(page);
    await page.getByRole("link", { name: "通常表示" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("region", { name: "日次サマリー" }),
    ).toBeVisible();
  });

  test("starts at 24 hours and switches to 7 and 30 days", async ({ page }) => {
    await page.goto("/simple");
    await revealSimpleDock(page);
    await expect(page.getByRole("button", { name: "24時間" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    for (const [name, label] of [
      ["7日", "7d"],
      ["30日", "30d"],
    ] as const) {
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
      await expect(page.getByRole("button", { name })).toHaveText(label);
    }
  });

  test("shares the persisted theme preference", async ({ page }) => {
    await page.goto("/simple");
    await revealSimpleDock(page);
    const themeTrigger = page.getByTestId("simple-theme-trigger");
    await themeTrigger.click();
    const themeMenu = page.getByTestId("simple-theme-menu");
    await expect(themeMenu).toBeVisible();
    await themeMenu.getByRole("menuitemradio", { name: "ダーク" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await revealSimpleDock(page);
    await page.getByTestId("simple-theme-trigger").click();
    await page
      .getByTestId("simple-theme-menu")
      .getByRole("menuitemradio", { name: "自動" })
      .click();
  });

  test("theme menu has three choices and closes with keyboard Escape", async ({
    page,
  }) => {
    await page.goto("/simple");
    await revealSimpleDock(page);
    const trigger = page.getByTestId("simple-theme-trigger");
    await expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await trigger.click();
    const menu = page.getByTestId("simple-theme-menu");
    await expect(menu).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(menu.getByRole("menuitemradio")).toHaveCount(3);
    await page.keyboard.press("ArrowDown");
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("requests fullscreen only from the visible user control", async ({
    page,
  }) => {
    await enableMockFullscreen(page);
    await page.goto("/simple");
    await revealSimpleDock(page);
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
    await page.goto("/simple");
    await expect(page.getByRole("button", { name: "全画面" })).toHaveCount(0);
  });

  test("reveals the dock only during interaction and closes it with Escape", async ({
    page,
  }) => {
    await page.goto("/simple");
    await expectSimpleDockHidden(page);

    await revealSimpleDock(page);
    await expect(page.getByRole("button", { name: "24時間" })).toHaveText(
      "24h",
    );

    await page.keyboard.press("Escape");
    await expectSimpleDockHidden(page);
  });
});

test.describe("simple chart details", () => {
  test("fine pointer hover and keyboard arrows show the selected time", async ({
    page,
    request,
  }) => {
    await setScenario(request, "normal");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/simple");
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
    await expect(page.locator(".echarts-tooltip")).toBeHidden();
    const detail = page.getByRole("region", { name: "選択時刻の詳細" });
    await expect(detail).toBeVisible();

    // Layout invariant tied to computeSimplePanelLayout in
    // web/src/lib/chart/option.ts: for viewport widths >= 600 the chart
    // reserves a 128px bottom band, so the aircon ribbon's bottom edge sits
    // at viewportHeight - 128 and the shared time-axis labels occupy the top
    // ~25px of that band (10px axisLabel margin + ~15px of 11px text). The
    // selection detail panel must start at or below that label band and stay
    // fully inside the viewport horizontally. If the reserved band or the
    // label metrics change in computeSimplePanelLayout, update these
    // constants as well.
    const detailBox = await detail.boundingBox();
    expect(detailBox).not.toBeNull();
    if (detailBox) {
      expect(detailBox.y).toBeGreaterThanOrEqual(900 - 128 + 25);
      expect(detailBox.x).toBeGreaterThanOrEqual(0);
      expect(detailBox.x + detailBox.width).toBeLessThanOrEqual(1440);
    }

    await chart.focus();
    await page.keyboard.press("ArrowRight");
    await expect(detail).toContainText("温度");
    await expect(detail).toContainText("湿度");
    await expect(detail).toContainText("エアコン認識");
    await page.keyboard.press("Escape");
    await expect(detail).toHaveCount(0);
  });

  test("tablet keyboard selection keeps the detail panel inside the viewport", async ({
    page,
    request,
  }) => {
    await setScenario(request, "normal");
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/simple");
    const chart = page.getByRole("img", {
      name: /温度、湿度、Nature Remo認識エアコン設定温度/,
    });
    await expect(chart.locator("canvas")).toBeVisible({ timeout: 15_000 });

    await chart.focus();
    await page.keyboard.press("ArrowRight");
    const detail = page.getByRole("region", { name: "選択時刻の詳細" });
    await expect(detail).toBeVisible();

    // Same reserved-band invariant as the desktop test above; see
    // computeSimplePanelLayout in web/src/lib/chart/option.ts (128px bottom
    // band for viewport widths >= 600, with the ~25px time-axis label strip
    // at its top). At 768px the optional detail items are hidden, so the
    // panel renders only the core set and must not overflow horizontally.
    const detailBox = await detail.boundingBox();
    expect(detailBox).not.toBeNull();
    if (detailBox) {
      expect(detailBox.y).toBeGreaterThanOrEqual(1024 - 128 + 25);
      expect(detailBox.x).toBeGreaterThanOrEqual(0);
      expect(detailBox.x + detailBox.width).toBeLessThanOrEqual(768);
    }
    await expectNoDocumentOverflow(page);
  });

  test.describe("coarse pointer", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test("tap pins details until the close control is used", async ({
      page,
      request,
    }) => {
      await setScenario(request, "normal");
      await page.goto("/simple");
      await expectSimpleDockHidden(page);
      const chart = page.getByRole("img", {
        name: /温度、湿度、Nature Remo認識エアコン設定温度/,
      });
      await expect(chart.locator("canvas")).toBeVisible({ timeout: 15_000 });
      await chart.tap({ position: { x: 200, y: 420 } });
      await expect(simpleDock(page)).toHaveAttribute(
        "data-menu-visible",
        "true",
      );
      await expect(page.locator(".echarts-tooltip")).toBeHidden();
      const detail = page.getByRole("region", { name: "選択時刻の詳細" });
      await expect(detail).toBeVisible();
      await detail.getByRole("button", { name: "詳細を閉じる" }).click();
      await expect(detail).toHaveCount(0);
    });
  });
});

test.describe("simple states", () => {
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
      await page.goto("/simple");
      await expect(page.getByText(message, { exact: false })).toBeVisible();
      await expect(page.locator("main.simple")).toHaveClass(/simple-danger/);
      await expect(page.locator("canvas").first()).toBeVisible({
        timeout: 15_000,
      });
    });
  }

  test("unknown aircon state is not guessed", async ({ page, request }) => {
    await setScenario(request, "airconUnknown");
    await page.goto("/simple");
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
    await page.goto("/simple");
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
    await page.goto("/simple");
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
    await page.goto("/simple");
    await expect(page.getByText("NATURE REMO認識")).toBeVisible();
    await expect(
      page.getByText("エアコン本体との双方向確認ではありません"),
    ).toHaveCount(0);
  });
});
