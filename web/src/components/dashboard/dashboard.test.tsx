import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { DashboardInitialData } from "@/hooks/use-dashboard-data";
import { FIXTURE_NOW, fixtureScenarios } from "@/test/fixtures";

import { Dashboard } from "./dashboard";

vi.mock("./environment-chart", () => ({
  default: () => <div data-testid="environment-chart" />,
  EnvironmentChart: () => <div data-testid="environment-chart" />,
}));

const statusMock = vi.fn();
const currentMock = vi.fn();
const environmentSeriesMock = vi.fn();
const airconSeriesMock = vi.fn();
const dailySummaryMock = vi.fn();

vi.mock("@/lib/api/browser-client", () => ({
  browserApi: {
    status: (...args: unknown[]) => statusMock(...args),
    current: (...args: unknown[]) => currentMock(...args),
    environmentSeries: (...args: unknown[]) => environmentSeriesMock(...args),
    airconSeries: (...args: unknown[]) => airconSeriesMock(...args),
    dailySummary: (...args: unknown[]) => dailySummaryMock(...args),
  },
}));

type ScenarioName = keyof typeof fixtureScenarios;

function initialFromScenario(
  name: ScenarioName,
  overrides: Partial<DashboardInitialData> = {},
): DashboardInitialData {
  const scenario = fixtureScenarios[name];
  return {
    status: scenario.status.data,
    current: scenario.current.data,
    currentFailed: false,
    environmentSeries: scenario.environmentSeries.data,
    airconSeries: scenario.airconSeries.data,
    dailySummary: scenario.dailySummary.data,
    historyFailed: false,
    ...overrides,
  };
}

function renderDashboard(
  name: ScenarioName,
  overrides: Partial<DashboardInitialData> = {},
) {
  return render(
    <Dashboard
      initial={initialFromScenario(name, overrides)}
      serverNowIso={FIXTURE_NOW}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// The hero splits its numerals into mixed-scale spans, so values are
// asserted against the joined hero text.
function heroText(): string {
  return Array.from(document.querySelectorAll(".hero-figure"))
    .map((element) => element.textContent ?? "")
    .join(" ");
}

describe("Dashboard scenarios", () => {
  it("renders current values, aircon state and disclaimer in the normal state", () => {
    renderDashboard("normal");

    expect(heroText()).toContain("26.4");
    expect(heroText()).toContain("58");
    expect(screen.getAllByText(/運転中/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/冷房/).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/エアコン本体との双方向確認ではありません/),
    ).toBeInTheDocument();
    expect(screen.getByText(/収集正常/)).toBeInTheDocument();
    expect(
      screen.queryByText("データ収集が停止しています"),
    ).not.toBeInTheDocument();
  });

  it("shows the waiting message while initializing without a stopped warning", () => {
    renderDashboard("initializing");

    expect(screen.getByText("収集データはまだありません")).toBeInTheDocument();
    expect(
      screen.queryByText("データ収集が停止しています"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("初回収集待ち")).toBeInTheDocument();
  });

  it("shows the no-data message for a healthy service without samples", () => {
    renderDashboard("noData");

    expect(screen.getByText("収集データはまだありません")).toBeInTheDocument();
    expect(
      screen.getByText("エアコンの認識状態はまだ取得できていません。"),
    ).toBeInTheDocument();
  });

  it("keeps the environment visible when only aircon data failed", () => {
    renderDashboard("partialEnvironmentOnly");

    expect(
      screen.getByText("一部のデータを取得できませんでした"),
    ).toBeInTheDocument();
    expect(heroText()).toContain("26.4");
    expect(
      screen.getByText("エアコンの認識状態はまだ取得できていません。"),
    ).toBeInTheDocument();
  });

  it("keeps the aircon visible when only environment data failed", () => {
    renderDashboard("partialAirconOnly");

    expect(
      screen.getByText("一部のデータを取得できませんでした"),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/運転中/).length).toBeGreaterThan(0);
    expect(
      screen.getByText("現在の計測値を表示できません"),
    ).toBeInTheDocument();
  });

  it("warns with danger severity when collection stopped and keeps last values", () => {
    renderDashboard("collectionStopped");

    const banner = screen.getByText("データ収集が停止しています");
    expect(banner.closest("li")).toHaveAttribute("data-severity", "danger");
    expect(heroText()).toContain("26.4");
    expect(
      screen.getByText(/最終取得から時間が経過しています/),
    ).toBeInTheDocument();
    expect(screen.getByText(/収集停止/)).toBeInTheDocument();
  });

  it("warns when the Remo is offline and keeps last values", () => {
    renderDashboard("remoOffline");

    expect(screen.getByText("Nature Remoがオフラインです")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Nature Remoがオフラインのため、現在値ではない可能性があります/,
      ),
    ).toBeInTheDocument();
    expect(heroText()).toContain("26.4");
  });

  it("treats unchanged readings as normal while keeping observation times", () => {
    renderDashboard("unchangedReadings");

    expect(heroText()).toContain("26.4");
    expect(
      screen.queryByText(/計測値が更新されていません/),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText(/計測時刻/).length).toBeGreaterThan(0);
  });

  it("shows unknown aircon state without guessing on or off", () => {
    renderDashboard("airconUnknown");

    const aircon = screen.getByRole("region", {
      name: "エアコン - Nature Remo認識状態",
    });
    expect(within(aircon).getAllByText(/不明/).length).toBeGreaterThan(0);
    expect(
      screen.getByText("エアコンの認識状態が不明です"),
    ).toBeInTheDocument();
    expect(within(aircon).queryByText(/運転中/)).not.toBeInTheDocument();
    expect(within(aircon).queryByText("停止")).not.toBeInTheDocument();
  });

  it("shows the raw value for an unknown aircon mode", () => {
    renderDashboard("unknownAirconMode");

    expect(screen.getAllByText(/vendor-eco-plus/).length).toBeGreaterThan(0);
  });

  it("never renders 実機状態 wording", () => {
    renderDashboard("normal");
    expect(screen.queryByText(/実機状態/)).not.toBeInTheDocument();
  });
});

describe("Dashboard error handling", () => {
  it("renders the page shell with retry when the initial fetch failed entirely", async () => {
    statusMock.mockResolvedValue(fixtureScenarios.normal.status);
    currentMock.mockResolvedValue(fixtureScenarios.normal.current);
    renderDashboard("normal", {
      status: null,
      current: null,
      currentFailed: true,
      environmentSeries: null,
      airconSeries: null,
      dailySummary: null,
      historyFailed: true,
    });

    expect(
      screen.getByText("ダッシュボードのデータを取得できませんでした"),
    ).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "再試行" }));
    expect(statusMock).toHaveBeenCalledTimes(1);
    expect(currentMock).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(heroText()).toContain("26.4");
    });
  });

  it("shows an in-card error with retry while keeping history", async () => {
    statusMock.mockResolvedValue(fixtureScenarios.normal.status);
    currentMock.mockResolvedValue(fixtureScenarios.normal.current);
    renderDashboard("normal", { currentFailed: true });

    expect(
      screen.getByText("最新の値を取得できませんでした"),
    ).toBeInTheDocument();
    // The last known values and the history section stay visible.
    expect(heroText()).toContain("26.4");
    expect(
      screen.getByRole("region", { name: "温度と湿度の履歴" }),
    ).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "再試行" }));
    expect(statusMock).toHaveBeenCalledTimes(1);
  });

  it("confines a history error to the history section with manual retry", async () => {
    environmentSeriesMock.mockResolvedValue(
      fixtureScenarios.normal.environmentSeries,
    );
    airconSeriesMock.mockResolvedValue(fixtureScenarios.normal.airconSeries);
    dailySummaryMock.mockResolvedValue(fixtureScenarios.normal.dailySummary);
    renderDashboard("normal", {
      environmentSeries: null,
      airconSeries: null,
      dailySummary: null,
      historyFailed: true,
    });

    const history = screen.getByRole("region", {
      name: "温度と湿度の履歴",
    });
    expect(
      within(history).getByText("履歴データを取得できませんでした"),
    ).toBeInTheDocument();
    expect(heroText()).toContain("26.4");

    const user = userEvent.setup();
    await user.click(within(history).getByRole("button", { name: "再試行" }));
    expect(environmentSeriesMock).toHaveBeenCalledTimes(1);
    expect(airconSeriesMock).toHaveBeenCalledTimes(1);
    expect(dailySummaryMock).toHaveBeenCalledTimes(1);
  });
});

describe("Dashboard period selection", () => {
  it("refetches history when switching presets and shows custom date fields", async () => {
    environmentSeriesMock.mockResolvedValue(
      fixtureScenarios.normal.environmentSeries,
    );
    airconSeriesMock.mockResolvedValue(fixtureScenarios.normal.airconSeries);
    dailySummaryMock.mockResolvedValue(fixtureScenarios.normal.dailySummary);
    renderDashboard("normal");

    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "7日" }));
    expect(environmentSeriesMock).toHaveBeenCalledTimes(1);
    const query = environmentSeriesMock.mock.calls[0]?.[0] as {
      resolution: string;
    };
    expect(query.resolution).toBe("auto");

    await user.click(screen.getByRole("radio", { name: "任意" }));
    expect(screen.getByLabelText("開始日")).toBeInTheDocument();
    expect(screen.getByLabelText("終了日")).toBeInTheDocument();
    // Switching to custom alone does not fetch until a range is applied.
    expect(environmentSeriesMock).toHaveBeenCalledTimes(1);
  });

  it("does not refetch when re-selecting the active preset", async () => {
    renderDashboard("normal");
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "24時間" }));
    expect(environmentSeriesMock).not.toHaveBeenCalled();
  });
});
