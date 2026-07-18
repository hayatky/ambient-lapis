import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const FAKE_API_URL = "http://127.0.0.1:3210";

const scenarioNames = [
  "normal",
  "initializing",
  "noData",
  "partialEnvironmentOnly",
  "partialAirconOnly",
  "collectionStopped",
  "remoOffline",
  "remoUnknown",
  "temperatureStale",
  "humidityStale",
  "nullMeasurements",
  "airconUnknown",
  "unknownAirconSettings",
  "autoMode",
  "warningPriority",
  "fullError",
  "currentApiError",
  "historyApiError",
  "apiError",
] as const;

type ScenarioName = (typeof scenarioNames)[number];

interface FakeApiState {
  scenario: ScenarioName;
  requests: string[];
}

function isScenarioName(value: unknown): value is ScenarioName {
  return scenarioNames.some((scenario) => scenario === value);
}

async function setScenario(
  request: APIRequestContext,
  scenario: ScenarioName,
): Promise<void> {
  const response = await request.put(`${FAKE_API_URL}/__control/scenario`, {
    data: { scenario },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

async function fakeApiState(request: APIRequestContext): Promise<FakeApiState> {
  const response = await request.get(`${FAKE_API_URL}/__control/scenario`);
  expect(response.ok()).toBe(true);
  const payload: unknown = await response.json();
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("scenario" in payload) ||
    !isScenarioName(payload.scenario) ||
    !("requests" in payload) ||
    !Array.isArray(payload.requests) ||
    !payload.requests.every((item) => typeof item === "string")
  ) {
    throw new Error(
      "fake API control response did not match its test contract",
    );
  }
  return { scenario: payload.scenario, requests: payload.requests };
}

function sectionWithHeading(page: Page, name: string) {
  return page.locator("section").filter({
    has: page.getByRole("heading", { name, exact: true }),
  });
}

async function openDashboard(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page).toHaveTitle("Ambient Lapis");
  await expect(
    page.getByRole("heading", { name: "室内の今", exact: true }),
  ).toBeVisible();
}

function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test.beforeEach(async ({ request }) => {
  await setScenario(request, "normal");
});

test("SSRとBFFを通して主要情報を正しい順序で表示する", async ({
  page,
  request,
}) => {
  const browserErrors = collectBrowserErrors(page);
  const directFakeApiRequests: string[] = [];
  page.on("request", (browserRequest) => {
    if (browserRequest.url().startsWith(FAKE_API_URL)) {
      directFakeApiRequests.push(browserRequest.url());
    }
  });

  await openDashboard(page);

  await expect(page.getByTestId("current-temperature")).toContainText("26.4");
  await expect(page.getByTestId("current-humidity")).toContainText("58");
  await expect(
    page.getByRole("heading", {
      name: "温度と湿度の履歴",
      exact: true,
    }),
  ).toBeVisible();
  const historyChart = page.locator("[data-history-chart]");
  await expect(historyChart).toHaveAttribute("data-state", "ready");
  await expect(
    historyChart.getByRole("img", {
      name: /^温度は左軸、湿度は右軸の履歴グラフ/,
    }),
  ).toBeVisible();
  const chartSummary = historyChart.locator("[data-chart-summary]");
  await expect(chartSummary).toHaveAttribute(
    "aria-label",
    "表示期間内の最低、最高、最新値",
  );
  for (const metric of ["temperature", "humidity"]) {
    const summary = chartSummary.locator(`[data-metric="${metric}"]`);
    await expect(summary.getByText("最低", { exact: true })).toBeVisible();
    await expect(summary.getByText("最高", { exact: true })).toBeVisible();
    await expect(summary.getByText("最新", { exact: true })).toBeVisible();
  }
  await expect(
    page.getByRole("heading", {
      name: "エアコン - Nature Remo認識状態",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("エアコン本体との双方向確認ではありません", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "7日間の記録", exact: true }),
  ).toBeVisible();

  const headingOrder = await page
    .locator("h2")
    .evaluateAll((headings) =>
      headings.map((heading) => heading.textContent?.trim()),
    );
  expect(headingOrder).toEqual([
    "室内の今",
    "温度と湿度の履歴",
    "エアコン - Nature Remo認識状態",
    "7日間の記録",
  ]);

  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

  await expect
    .poll(async () => (await fakeApiState(request)).requests)
    .toEqual(expect.arrayContaining(["/api/v1/status", "/api/v1/current"]));
  const upstreamRequests = (await fakeApiState(request)).requests;
  expect(
    upstreamRequests.some((path) =>
      path.startsWith("/api/v1/environment/series?"),
    ),
  ).toBe(true);
  expect(
    upstreamRequests.some((path) => path.startsWith("/api/v1/aircon/series?")),
  ).toBe(true);
  expect(
    upstreamRequests.some((path) => path.startsWith("/api/v1/daily-summary?")),
  ).toBe(true);
  expect(directFakeApiRequests).toEqual([]);
  expect(browserErrors).toEqual([]);
});

test("マウスhoverまたはタッチtapでグラフの詳細表示を操作する", async ({
  page,
}, testInfo) => {
  const browserErrors = collectBrowserErrors(page);
  await openDashboard(page);
  const chartHost = page.locator("[data-chart-canvas]");
  await expect(chartHost.locator("canvas")).toBeVisible();

  const box = await chartHost.boundingBox();
  expect(box).not.toBeNull();
  const position = {
    x: Math.round((box?.width ?? 0) * 0.55),
    y: Math.round((box?.height ?? 0) * 0.45),
  };
  const before = await chartHost.screenshot();

  if (testInfo.project.name === "desktop-chromium") {
    await chartHost.hover({ position });
  } else {
    await chartHost.tap({ position });
  }

  await expect
    .poll(async () => Buffer.compare(before, await chartHost.screenshot()))
    .not.toBe(0);
  await page.getByRole("heading", { name: "室内の今" }).click();
  expect(browserErrors).toEqual([]);
});

test("ライト・ダーク・端末設定を選択し、再読み込み後も保持する", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openDashboard(page);

  const themeGroup = page.getByRole("group", { name: "表示テーマ" });
  await expect(themeGroup).toBeVisible();
  await expect(page.getByRole("radio", { name: "端末設定" })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.getByRole("radio", { name: "ダーク" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.getByRole("radio", { name: "ダーク" })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("radio", { name: "ライト" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("viewportに応じて情報順を保ったレスポンシブ配置にする", async ({
  page,
}, testInfo) => {
  await openDashboard(page);

  const environment = await sectionWithHeading(page, "室内の今").boundingBox();
  const history = await page.locator("[data-history-chart]").boundingBox();
  const aircon = await sectionWithHeading(
    page,
    "エアコン - Nature Remo認識状態",
  ).boundingBox();
  const daily = await sectionWithHeading(page, "7日間の記録").boundingBox();
  expect(environment).not.toBeNull();
  expect(history).not.toBeNull();
  expect(aircon).not.toBeNull();
  expect(daily).not.toBeNull();
  if (!environment || !history || !aircon || !daily) return;

  if (testInfo.project.name === "mobile-chromium") {
    expect(environment.y).toBeLessThan(history.y);
    expect(history.y).toBeLessThan(aircon.y);
    expect(aircon.y).toBeLessThan(daily.y);
    return;
  }

  expect(Math.abs(environment.y - aircon.y)).toBeLessThanOrEqual(24);
  expect(history.y).toBeGreaterThanOrEqual(
    Math.max(environment.y + environment.height, aircon.y + aircon.height),
  );
  expect(daily.y).toBeGreaterThanOrEqual(history.y + history.height);
  if (testInfo.project.name === "desktop-chromium") {
    expect(environment.width).toBeGreaterThan(aircon.width);
  }
});

test(
  "タッチ環境の主要操作領域を44px以上に保つ",
  { tag: "@touch" },
  async ({ page }) => {
    await openDashboard(page);

    for (const selector of [
      "[data-theme-selector] label",
      ".period-selector label",
    ]) {
      const targets = page.locator(selector);
      await expect(targets.first()).toBeVisible();
      const count = await targets.count();
      for (let index = 0; index < count; index += 1) {
        const box = await targets.nth(index).boundingBox();
        expect(box, `${selector} ${index} should have a box`).not.toBeNull();
        expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
    }
  },
);

test("320pxでも状態と操作を欠けさせず現在値を表示する", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium");
  await page.setViewportSize({ width: 320, height: 720 });
  await openDashboard(page);

  await expect(page.getByText("収集は正常です", { exact: true })).toBeVisible();
  await expect(page.getByTestId("current-temperature")).toContainText("26.4");
  await expect(page.getByTestId("current-humidity")).toContainText("58");
  await expect(
    page.getByRole("heading", { name: "温度と湿度の履歴", exact: true }),
  ).toBeVisible();

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  if (!viewport) return;

  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);

  for (const selector of [
    "[data-theme-selector] label",
    ".period-selector label",
  ]) {
    const targets = page.locator(selector);
    const count = await targets.count();
    for (let index = 0; index < count; index += 1) {
      const box = await targets.nth(index).boundingBox();
      expect(box, `${selector} ${index} should have a box`).not.toBeNull();
      if (!box) continue;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  }
});

test(
  "期間プリセット、キーボード操作、任意のJST日付範囲を反映する",
  { tag: "@desktop" },
  async ({ page, request }) => {
    await openDashboard(page);

    const sevenDays = page.getByRole("radio", { name: "7日", exact: true });
    await sevenDays.focus();
    await sevenDays.press("ArrowRight");
    await expect(
      page.getByRole("radio", { name: "30日", exact: true }),
    ).toBeChecked();

    await expect
      .poll(async () => {
        const state = await fakeApiState(request);
        return state.requests.filter((path) =>
          path.startsWith("/api/v1/environment/series?"),
        ).length;
      })
      .toBeGreaterThanOrEqual(2);

    await page.getByRole("radio", { name: "任意", exact: true }).check();
    const customRange = page.getByRole("group", { name: "任意期間" });
    await customRange.getByLabel("開始日").fill("2026-07-10");
    await customRange.getByLabel("終了日").fill("2026-07-12");
    await customRange.getByRole("button", { name: "表示する" }).click();

    await expect
      .poll(async () => {
        const state = await fakeApiState(request);
        const latest = state.requests
          .filter((path) => path.startsWith("/api/v1/environment/series?"))
          .at(-1);
        if (!latest) return null;
        const query = new URL(latest, FAKE_API_URL).searchParams;
        return { from: query.get("from"), to: query.get("to") };
      })
      .toEqual({
        from: "2026-07-09T15:00:00.000Z",
        to: "2026-07-12T15:00:00.000Z",
      });
  },
);

test(
  "データなし、停止、オフライン、古い値、不明、部分失敗を区別する",
  { tag: "@desktop" },
  async ({ page, request }) => {
    const cases: ReadonlyArray<{
      scenario: ScenarioName;
      text: string;
    }> = [
      { scenario: "initializing", text: "初回の収集を待っています" },
      { scenario: "noData", text: "収集データはまだありません" },
      { scenario: "collectionStopped", text: "データ収集が停止しています" },
      { scenario: "remoOffline", text: "Nature Remoがオフラインです" },
      {
        scenario: "temperatureStale",
        text: "温度の計測値が更新されていません",
      },
      { scenario: "airconUnknown", text: "エアコンの認識状態が不明です" },
      {
        scenario: "partialEnvironmentOnly",
        text: "一部のデータを取得できませんでした",
      },
      {
        scenario: "fullError",
        text: "最新のデータ収集に失敗しました",
      },
    ];

    for (const fixture of cases) {
      await setScenario(request, fixture.scenario);
      await openDashboard(page);
      await expect(
        page.getByText(fixture.text, { exact: true }).first(),
      ).toBeVisible();
    }
  },
);

test(
  "欠損値、未知設定、自動モード温度を推測せず表示する",
  { tag: "@desktop" },
  async ({ page, request }) => {
    await setScenario(request, "nullMeasurements");
    await openDashboard(page);
    await expect(page.getByTestId("current-temperature")).toContainText("--");
    await expect(page.getByTestId("current-humidity")).toContainText("--");
    await expect(
      page.getByText("Remo 状態不明", { exact: true }),
    ).toBeVisible();

    await setScenario(request, "unknownAirconSettings");
    await openDashboard(page);
    const aircon = sectionWithHeading(page, "エアコン - Nature Remo認識状態");
    await expect(
      aircon.getByText("不明（vendor-eco-plus）", { exact: true }),
    ).toBeVisible();
    await expect(
      aircon.getByText("不明（vendor-breeze）", { exact: true }),
    ).toBeVisible();
    await expect(
      aircon.getByText("不明（vendor-swing-wide）", { exact: true }),
    ).toBeVisible();

    await setScenario(request, "autoMode");
    await openDashboard(page);
    await expect(
      sectionWithHeading(page, "エアコン - Nature Remo認識状態").getByText(
        "温度調整 +1.5",
        { exact: true },
      ),
    ).toBeVisible();
  },
);

test(
  "複数警告は収集停止を最優先にし、残りを短く列挙する",
  { tag: "@desktop" },
  async ({ page, request }) => {
    await setScenario(request, "warningPriority");
    await openDashboard(page);

    const rail = page.getByRole("alert", { name: "現在の注意事項" });
    await expect(
      rail.getByRole("heading", { name: "データ収集が停止しています" }),
    ).toBeVisible();
    const secondary = rail.getByRole("list", { name: "その他の注意事項" });
    await expect(secondary).toContainText("Nature Remoがオフラインです");
    await expect(secondary).toContainText("一部のデータを取得できませんでした");
    await expect(secondary).toContainText("温度の計測値が更新されていません");
    await expect(secondary).toContainText("湿度の計測値が更新されていません");
    await expect(secondary).toContainText("エアコンの認識状態が不明です");
  },
);

test(
  "APIエラーから手動再試行でlast-good表示へ復帰する",
  { tag: "@desktop" },
  async ({ page, request }) => {
    await setScenario(request, "currentApiError");
    await openDashboard(page);

    const environment = sectionWithHeading(page, "室内の今");
    await expect
      .poll(async () => {
        const state = await fakeApiState(request);
        return state.requests.filter((path) => path === "/api/v1/current")
          .length;
      })
      .toBeGreaterThanOrEqual(2);
    await expect(
      environment.getByRole("button", { name: "再試行" }),
    ).toBeVisible();

    await setScenario(request, "normal");
    await environment.getByRole("button", { name: "再試行" }).click();
    await expect(page.getByTestId("current-temperature")).toContainText("26.4");
  },
);

test(
  "履歴APIエラーをグラフ内に閉じ、再試行で復帰する",
  { tag: "@desktop" },
  async ({ page, request }) => {
    await setScenario(request, "historyApiError");
    await openDashboard(page);

    const history = page.locator("[data-history-chart]");
    await expect
      .poll(async () => {
        const state = await fakeApiState(request);
        return state.requests.filter((path) =>
          path.startsWith("/api/v1/environment/series?"),
        ).length;
      })
      .toBeGreaterThanOrEqual(2);
    await expect(history).toHaveAttribute("data-state", "error");
    await expect(
      history.getByRole("button", { name: "履歴を再取得" }),
    ).toBeVisible();
    await expect(page.getByTestId("current-temperature")).toContainText("26.4");

    await setScenario(request, "normal");
    await history.getByRole("button", { name: "履歴を再取得" }).click();
    await expect(history).toHaveAttribute("data-state", "ready");
    await expect(history.locator("canvas")).toBeVisible();
  },
);

test("reduced motion設定でCSSアニメーションを実質無効化する", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openDashboard(page);
  await expect
    .poll(() =>
      page.evaluate(
        () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
    )
    .toBe(true);

  const transitionDurationSeconds = await page
    .getByRole("radio", { name: "24時間", exact: true })
    .locator("..")
    .evaluate((element) => {
      const values = getComputedStyle(element).transitionDuration.split(",");
      return Math.max(
        ...values.map((value) => {
          const trimmed = value.trim();
          return trimmed.endsWith("ms")
            ? Number.parseFloat(trimmed) / 1_000
            : Number.parseFloat(trimmed);
        }),
      );
    });
  expect(transitionDurationSeconds).toBeLessThanOrEqual(0.000_01);
});
