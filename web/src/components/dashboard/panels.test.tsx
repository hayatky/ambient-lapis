import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  mapAircon,
  mapCurrentEnvironment,
  mapDailySummary,
  mapWarnings,
  type DailySummaryViewModel,
} from "@/lib/view-model";
import { FIXTURE_NOW, fixtureScenarios } from "@/test/fixtures";

import {
  AirconPanel,
  DailySummaryPanel,
  EnvironmentPanel,
  WarningRail,
  type RetryState,
} from "./panels";

const NOW = new Date(FIXTURE_NOW);

function readyState(overrides: Partial<RetryState> = {}): RetryState {
  return {
    errorMessage: null,
    isLoading: false,
    isRefreshing: false,
    onRetry: vi.fn(),
    ...overrides,
  };
}

describe("EnvironmentPanel", () => {
  it("shows normal values with distinct observation and fetch timestamps", () => {
    const environment = mapCurrentEnvironment(
      fixtureScenarios.normal.current.data,
      NOW,
    );
    render(
      <EnvironmentPanel
        environment={environment}
        initializing={false}
        state={readyState()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "室内の今" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("current-temperature")).toHaveTextContent(
      "26.4°C",
    );
    expect(screen.getByTestId("current-humidity")).toHaveTextContent("58%");
    expect(screen.getByText("Remo オンライン")).toBeInTheDocument();
    const observationTimes = document.querySelectorAll(
      ".current-metric__meta time",
    );
    expect(observationTimes).toHaveLength(2);
    expect(observationTimes[0]).toHaveAttribute(
      "datetime",
      "2026-07-18T12:31:42.000Z",
    );
    expect(observationTimes[1]).toHaveAttribute(
      "datetime",
      "2026-07-18T12:31:45.000Z",
    );
    expect(
      document.querySelector(".environment-panel__footer time"),
    ).toHaveAttribute("datetime", "2026-07-18T12:33:00.000Z");
  });

  it("keeps NULL measurements unknown instead of inventing values or times", () => {
    const environment = mapCurrentEnvironment(
      fixtureScenarios.nullMeasurements.current.data,
      NOW,
    );
    render(
      <EnvironmentPanel
        environment={environment}
        initializing={false}
        state={readyState()}
      />,
    );

    expect(screen.getByTestId("current-temperature")).toHaveTextContent("--°C");
    expect(screen.getByTestId("current-humidity")).toHaveTextContent("--%");
    expect(screen.getAllByText("計測時刻 --")).toHaveLength(2);
    expect(screen.getByText("Remo 状態不明")).toBeInTheDocument();
  });

  it("distinguishes loading, initializing, and collected-no-data states", () => {
    const { rerender } = render(
      <EnvironmentPanel
        environment={null}
        initializing
        state={readyState({ isLoading: true })}
      />,
    );
    expect(
      screen.getByRole("status", { name: "現在値を読み込んでいます" }),
    ).toBeInTheDocument();

    rerender(
      <EnvironmentPanel environment={null} initializing state={readyState()} />,
    );
    expect(screen.getByText("初回の収集を待っています")).toBeInTheDocument();

    rerender(
      <EnvironmentPanel
        environment={null}
        initializing={false}
        state={readyState()}
      />,
    );
    expect(screen.getByText("収集データはまだありません")).toBeInTheDocument();
  });

  it("preserves values while explaining offline and stale states", () => {
    const offline = mapCurrentEnvironment(
      fixtureScenarios.remoOffline.current.data,
      NOW,
    );
    const stale = mapCurrentEnvironment(
      fixtureScenarios.temperatureStale.current.data,
      NOW,
    );
    const { rerender } = render(
      <EnvironmentPanel
        environment={offline}
        initializing={false}
        state={readyState()}
      />,
    );

    expect(screen.getByText("Remo オフライン")).toBeInTheDocument();
    expect(
      screen.getByText("表示値は現在値ではない可能性があります"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("current-temperature")).toHaveTextContent("26.4");

    rerender(
      <EnvironmentPanel
        environment={stale}
        initializing={false}
        state={readyState()}
      />,
    );
    expect(
      screen.getByText(/計測値が更新されていません（3分前）/),
    ).toBeInTheDocument();
    expect(screen.getByTestId("current-temperature")).toHaveTextContent("26.4");
  });

  it("keeps last-good values visible with a retryable API error", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const environment = mapCurrentEnvironment(
      fixtureScenarios.normal.current.data,
      NOW,
    );
    render(
      <EnvironmentPanel
        environment={environment}
        initializing={false}
        state={readyState({
          errorMessage: "現在値を更新できませんでした",
          onRetry,
        })}
      />,
    );

    expect(screen.getByTestId("current-temperature")).toHaveTextContent("26.4");
    expect(screen.getByRole("status")).toHaveTextContent(
      "現在値を更新できませんでした",
    );
    await user.click(screen.getByRole("button", { name: /再試行/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("AirconPanel", () => {
  it("shows known recognition settings and the permanent accuracy disclaimer", () => {
    const aircon = mapAircon(fixtureScenarios.normal.current.data, NOW);
    render(
      <AirconPanel aircon={aircon} initializing={false} state={readyState()} />,
    );

    expect(
      screen.getByRole("heading", {
        name: "エアコン - Nature Remo認識状態",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("aircon-recognition-state")).toHaveTextContent(
      "運転中",
    );
    expect(screen.getByText("冷房")).toBeInTheDocument();
    expect(settingValue("温度の指定")).toHaveTextContent("26.0 °C");
    expect(settingValue("風量")).toHaveTextContent("自動");
    expect(settingValue("上下風向")).toHaveTextContent("自動");
    expect(settingValue("左右風向")).toHaveTextContent("--");
    expect(
      screen.getByText("エアコン本体との双方向確認ではありません"),
    ).toBeInTheDocument();
  });

  it("labels auto mode temperature as a relative adjustment", () => {
    const aircon = mapAircon(fixtureScenarios.autoMode.current.data, NOW);
    render(
      <AirconPanel aircon={aircon} initializing={false} state={readyState()} />,
    );

    expect(
      screen.getByText("自動", { selector: ".aircon-mode" }),
    ).toBeInTheDocument();
    expect(settingValue("温度の指定")).toHaveTextContent("温度調整 +1.5");
    expect(settingValue("温度の指定")).not.toHaveTextContent("°C");
  });

  it("shows unknown raw settings honestly and leaves empty settings as --", () => {
    const aircon = mapAircon(
      fixtureScenarios.unknownAirconSettings.current.data,
      NOW,
    );
    render(
      <AirconPanel aircon={aircon} initializing={false} state={readyState()} />,
    );

    expect(screen.getByText("不明（vendor-eco-plus）")).toBeInTheDocument();
    expect(settingValue("風量")).toHaveTextContent("不明（vendor-breeze）");
    expect(settingValue("上下風向")).toHaveTextContent(
      "不明（vendor-swing-wide）",
    );
    expect(settingValue("左右風向")).toHaveTextContent("--");
  });

  it("does not infer ON/OFF when recognition state is unknown", () => {
    const aircon = mapAircon(fixtureScenarios.airconUnknown.current.data, NOW);
    render(
      <AirconPanel aircon={aircon} initializing={false} state={readyState()} />,
    );

    expect(screen.getByTestId("aircon-recognition-state")).toHaveTextContent(
      "不明",
    );
    expect(screen.queryByText("運転中")).not.toBeInTheDocument();
    expect(screen.queryByText("停止")).not.toBeInTheDocument();
  });

  it("distinguishes initializing from no collected aircon data", () => {
    const { rerender } = render(
      <AirconPanel aircon={null} initializing state={readyState()} />,
    );
    expect(screen.getByText("認識状態を待っています")).toBeInTheDocument();

    rerender(
      <AirconPanel aircon={null} initializing={false} state={readyState()} />,
    );
    expect(
      screen.getByText("エアコンの収集データはまだありません"),
    ).toBeInTheDocument();
  });
});

describe("DailySummaryPanel", () => {
  it("renders daily extrema and reports a real gap duration", () => {
    const days = mapDailySummary(fixtureScenarios.normal.dailySummary.data);
    render(<DailySummaryPanel days={days} state={readyState()} />);

    const table = screen.getByRole("table");
    expect(within(table).getByText("24.8 °C")).toBeInTheDocument();
    expect(within(table).getByText("26.3 °C")).toBeInTheDocument();
    expect(within(table).getByText("28.1 °C")).toBeInTheDocument();
    expect(within(table).getByText("12分")).toBeInTheDocument();
  });

  it("renders NULL daily metrics as -- and never as zero", () => {
    const days: DailySummaryViewModel[] = [
      {
        date: "2026-07-17",
        dateLabel: "2026年7月17日(金)",
        temperature: null,
        humidity: {
          average: null,
          minimum: null,
          maximum: null,
          sampleCount: 0,
        },
        gapMinutes: 0,
      },
    ];
    render(<DailySummaryPanel days={days} state={readyState()} />);

    expect(screen.getAllByText("--")).toHaveLength(6);
    expect(screen.queryByText(/^0(?:\.0)? (?:°C|%)$/)).not.toBeInTheDocument();
    expect(screen.getByText("なし")).toBeInTheDocument();
  });
});

describe("WarningRail", () => {
  it("surfaces a failed latest collection without discarding collected values", () => {
    const scenario = fixtureScenarios.fullError;
    const warnings = mapWarnings(scenario.status.data, scenario.current.data);
    render(<WarningRail warnings={warnings} />);

    expect(
      screen.getByRole("status", { name: "現在の注意事項" }),
    ).toHaveTextContent("最新のデータ収集に失敗しました");
    expect(screen.getByText(/取得済みの値を表示/)).toBeInTheDocument();
  });

  it("keeps stopped, offline, stale, and unknown warnings in priority order", () => {
    const scenario = fixtureScenarios.warningPriority;
    const warnings = mapWarnings(scenario.status.data, scenario.current.data);
    render(<WarningRail warnings={warnings} />);

    expect(
      screen.getByRole("alert", { name: "現在の注意事項" }),
    ).toHaveTextContent("データ収集が停止しています");
    const more = screen.getByRole("list", { name: "その他の注意事項" });
    expect(
      within(more)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "Nature Remoがオフラインです",
      "一部のデータを取得できませんでした",
      "温度の計測値が更新されていません",
      "湿度の計測値が更新されていません",
      "エアコンの認識状態が不明です",
    ]);
  });
});

function settingValue(label: string): HTMLElement {
  const term = screen.getByText(label, { selector: "dt" });
  const row = term.parentElement;
  if (!row) throw new Error(`setting row not found: ${label}`);
  const value = row.querySelector("dd");
  if (!value) throw new Error(`setting value not found: ${label}`);
  return value;
}
