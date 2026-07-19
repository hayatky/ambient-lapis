import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { EnvironmentChartSelection } from "@/components/dashboard/environment-chart";
import type { SimpleInitialData } from "@/hooks/use-simple-data";
import type {
  AirconSegmentViewModel,
  ChartMetricViewModel,
  DisplayTimestamp,
  EnvironmentChartPointViewModel,
} from "@/lib/view-model";
import { FIXTURE_NOW, fixtureScenarios } from "@/test/fixtures";

import { Simple } from "./simple";

const emittedSelection = vi.hoisted(() => ({
  current: null as EnvironmentChartSelection | null,
}));

vi.mock("@/components/dashboard/environment-chart", () => ({
  EnvironmentChart: ({
    onSelectionChange,
    ariaLabel,
  }: {
    onSelectionChange?: (value: EnvironmentChartSelection | null) => void;
    ariaLabel: string;
  }) => (
    <button
      type="button"
      data-testid="simple-chart"
      data-aria-label={ariaLabel}
      onClick={() =>
        onSelectionChange?.(
          emittedSelection.current ?? {
            epochMs: Date.parse(FIXTURE_NOW),
            point: null,
            airconSegment: null,
          },
        )
      }
    >
      chart
    </button>
  ),
}));

const statusMock = vi.fn();
const currentMock = vi.fn();
const environmentSeriesMock = vi.fn();
const airconSeriesMock = vi.fn();
const requestFullscreenMock = vi.fn();
const exitFullscreenMock = vi.fn();

vi.mock("@/lib/api/browser-client", () => ({
  browserApi: {
    status: (...args: unknown[]) => statusMock(...args),
    current: (...args: unknown[]) => currentMock(...args),
    environmentSeries: (...args: unknown[]) => environmentSeriesMock(...args),
    airconSeries: (...args: unknown[]) => airconSeriesMock(...args),
  },
}));

const scenario = fixtureScenarios.normal;
const initial: SimpleInitialData = {
  status: scenario.status.data,
  current: scenario.current.data,
  currentFailed: false,
  environmentSeries: scenario.environmentSeries.data,
  airconSeries: scenario.airconSeries.data,
  historyFailed: false,
};

function displayTimestamp(iso: string): DisplayTimestamp {
  return { iso, epochMs: Date.parse(iso), label: iso, ageSeconds: 0 };
}

function chartMetric(value: number | null): ChartMetricViewModel {
  return {
    value,
    minimum: null,
    maximum: null,
    observedAt: null,
    sampleCount: null,
  };
}

const selectedPoint: EnvironmentChartPointViewModel = {
  time: displayTimestamp("2026-07-18T12:25:00.000Z"),
  temperature: chartMetric(26.1),
  humidity: chartMetric(57),
  remoOnlineState: "online",
  gap: false,
};

const gapPoint: EnvironmentChartPointViewModel = {
  time: displayTimestamp("2026-07-18T12:30:00.000Z"),
  temperature: chartMetric(null),
  humidity: chartMetric(null),
  remoOnlineState: "unknown",
  gap: true,
};

const coolingSegment: AirconSegmentViewModel = {
  from: displayTimestamp("2026-07-18T12:00:00.000Z"),
  to: displayTimestamp("2026-07-18T12:30:00.000Z"),
  state: "on",
  mode: "冷房",
  targetTemperatureC: 26,
};

const gapSegment: AirconSegmentViewModel = {
  from: displayTimestamp("2026-07-18T12:30:00.000Z"),
  to: displayTimestamp("2026-07-18T12:35:00.000Z"),
  state: "gap",
  mode: null,
  targetTemperatureC: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  emittedSelection.current = null;
  window.localStorage.clear();
  Object.defineProperty(document, "fullscreenEnabled", {
    configurable: true,
    value: true,
  });
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    value: null,
  });
  Object.defineProperty(document.documentElement, "requestFullscreen", {
    configurable: true,
    value: requestFullscreenMock,
  });
  Object.defineProperty(document, "exitFullscreen", {
    configurable: true,
    value: exitFullscreenMock,
  });
  requestFullscreenMock.mockResolvedValue(undefined);
  exitFullscreenMock.mockResolvedValue(undefined);
  statusMock.mockResolvedValue(scenario.status);
  currentMock.mockResolvedValue(scenario.current);
  environmentSeriesMock.mockResolvedValue(scenario.environmentSeries);
  airconSeriesMock.mockResolvedValue(scenario.airconSeries);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Simple", () => {
  it("keeps current values and reveals controls after interaction", async () => {
    render(<Simple initial={initial} serverNowIso={FIXTURE_NOW} />);
    expect(
      screen.getByRole("region", { name: "現在の室内環境" }),
    ).toHaveTextContent("26.4");
    expect(
      screen.getByRole("region", { name: "現在の室内環境" }),
    ).toHaveTextContent("58");
    expect(
      screen.getByRole("region", { name: "エアコン - Nature Remo認識状態" }),
    ).toHaveTextContent("運転中");
    const root = screen.getByTestId("simple-root");
    const dock = screen.getByTestId("simple-header-menu");
    expect(screen.getByTestId("simple-header")).toContainElement(dock);
    expect(screen.getByTestId("simple-bottom-overlays")).not.toContainElement(
      dock,
    );
    expect(dock).toHaveAttribute("data-menu-visible", "false");
    expect(screen.getByTestId("simple-brand")).not.toHaveClass(
      "simple-brand-menu-visible",
    );
    fireEvent.touchStart(root);
    expect(dock).toHaveAttribute("data-menu-visible", "true");
    expect(screen.getByTestId("simple-brand")).toHaveClass(
      "simple-brand-menu-visible",
    );
    expect(screen.getByRole("button", { name: "24時間" })).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /全画面/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "通常表示" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByTestId("simple-theme-trigger")).toBeInTheDocument();
    expect(screen.queryByText("収集正常")).not.toBeInTheDocument();
    expect(screen.queryByText(/双方向確認/)).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dock).toHaveAttribute("data-menu-visible", "false");
    fireEvent.keyDown(document, { key: "Tab" });
    expect(dock).toHaveAttribute("data-menu-visible", "true");
  });

  it("loads a new range and exposes selected chart details", async () => {
    const user = userEvent.setup();
    render(<Simple initial={initial} serverNowIso={FIXTURE_NOW} />);
    fireEvent.pointerMove(screen.getByTestId("simple-root"));
    await user.click(screen.getByRole("button", { name: "7日" }));
    expect(environmentSeriesMock).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId("simple-chart"));
    expect(
      screen.getByRole("region", { name: "選択時刻の詳細" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "詳細を閉じる" }));
    expect(
      screen.queryByRole("region", { name: "選択時刻の詳細" }),
    ).not.toBeInTheDocument();
  });

  it("shows aircon mode, target, and signed room delta for a selected point", async () => {
    const user = userEvent.setup();
    emittedSelection.current = {
      epochMs: selectedPoint.time.epochMs,
      point: selectedPoint,
      airconSegment: coolingSegment,
    };
    render(<Simple initial={initial} serverNowIso={FIXTURE_NOW} />);
    await user.click(screen.getByTestId("simple-chart"));
    const panel = screen.getByRole("region", { name: "選択時刻の詳細" });
    expect(panel).toHaveTextContent("温度");
    expect(panel).toHaveTextContent("26.1 °C");
    expect(panel).toHaveTextContent("湿度");
    expect(panel).toHaveTextContent("57 %");
    expect(panel).toHaveTextContent("運転中・冷房");
    expect(panel).toHaveTextContent("26.0 °C");
    expect(panel).toHaveTextContent("+0.1 °C");
    const dots = panel.querySelectorAll("span.rounded-full");
    expect(dots).toHaveLength(2);
    expect(dots[0]?.getAttribute("class") ?? "").toContain(
      "bg-[var(--temperature)]",
    );
    expect(dots[1]?.getAttribute("class") ?? "").toContain(
      "bg-[var(--humidity)]",
    );
  });

  it("replaces temperature and humidity with a gap notice for a gap point", async () => {
    const user = userEvent.setup();
    emittedSelection.current = {
      epochMs: gapPoint.time.epochMs,
      point: gapPoint,
      airconSegment: null,
    };
    render(<Simple initial={initial} serverNowIso={FIXTURE_NOW} />);
    await user.click(screen.getByTestId("simple-chart"));
    const panel = screen.getByRole("region", { name: "選択時刻の詳細" });
    expect(panel).toHaveTextContent("データなし(欠損)");
    expect(panel).not.toHaveTextContent("温度");
    expect(panel).not.toHaveTextContent("湿度");
    expect(panel.querySelectorAll("span.rounded-full")).toHaveLength(0);
    expect(panel).toHaveTextContent("Remo unknown");
    expect(panel).toHaveTextContent("エアコン認識 --");
    expect(panel).toHaveTextContent("設定 --");
    expect(panel).toHaveTextContent("室温差 --");
  });

  it("labels a gap aircon segment as データなし", async () => {
    const user = userEvent.setup();
    emittedSelection.current = {
      epochMs: selectedPoint.time.epochMs,
      point: selectedPoint,
      airconSegment: gapSegment,
    };
    render(<Simple initial={initial} serverNowIso={FIXTURE_NOW} />);
    await user.click(screen.getByTestId("simple-chart"));
    const panel = screen.getByRole("region", { name: "選択時刻の詳細" });
    expect(panel).toHaveTextContent("エアコン認識 データなし");
    expect(panel).not.toHaveTextContent("欠損");
  });

  it("keeps successful current values and history when status failed", () => {
    render(
      <Simple
        initial={{ ...initial, status: null, currentFailed: true }}
        serverNowIso={FIXTURE_NOW}
      />,
    );
    expect(
      screen.getByRole("region", { name: "現在の室内環境" }),
    ).toHaveTextContent("26.4");
    expect(
      screen.getByRole("region", { name: "エアコン - Nature Remo認識状態" }),
    ).toHaveTextContent("運転中");
    expect(screen.getByTestId("simple-chart")).toBeInTheDocument();
  });

  it("keeps a severe collection warning visible while the dock is hidden", () => {
    const stopped = fixtureScenarios.collectionStopped;
    render(
      <Simple
        initial={{
          status: stopped.status.data,
          current: stopped.current.data,
          currentFailed: false,
          environmentSeries: stopped.environmentSeries.data,
          airconSeries: stopped.airconSeries.data,
          historyFailed: false,
        }}
        serverNowIso={FIXTURE_NOW}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "データ収集が停止しています",
    );
    expect(screen.getByTestId("simple-header-menu")).toHaveAttribute(
      "data-menu-visible",
      "false",
    );
  });

  it("shows the empty state instead of a chart canvas for an empty series", () => {
    render(
      <Simple
        initial={{
          ...initial,
          environmentSeries: {
            ...scenario.environmentSeries.data,
            points: [],
          },
        }}
        serverNowIso={FIXTURE_NOW}
      />,
    );
    expect(
      screen.getByText("表示できる履歴はまだありません"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("simple-chart")).not.toBeInTheDocument();
  });

  it("keeps the old chart range and shows retry when a period refresh partially fails", async () => {
    airconSeriesMock.mockRejectedValue(new Error("unavailable"));
    const user = userEvent.setup();
    render(<Simple initial={initial} serverNowIso={FIXTURE_NOW} />);
    fireEvent.pointerMove(screen.getByTestId("simple-root"));
    expect(screen.getByTestId("simple-chart")).toHaveAttribute(
      "data-aria-label",
      expect.stringContaining("24時間"),
    );
    await user.click(screen.getByRole("button", { name: "7日" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("履歴更新失敗"),
    );
    expect(screen.getByTestId("simple-chart")).toHaveAttribute(
      "data-aria-label",
      expect.stringContaining("24時間"),
    );
    expect(screen.getByRole("button", { name: "再試行" })).toBeInTheDocument();
  });

  it("hides fullscreen when the complete API is unavailable", async () => {
    Object.defineProperty(document, "fullscreenEnabled", {
      configurable: true,
      value: false,
    });
    render(<Simple initial={initial} serverNowIso={FIXTURE_NOW} />);
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /全画面/ }),
      ).not.toBeInTheDocument(),
    );
  });

  it("keeps the simple usable when fullscreen permission is rejected", async () => {
    requestFullscreenMock.mockRejectedValue(new Error("denied"));
    const user = userEvent.setup();
    render(<Simple initial={initial} serverNowIso={FIXTURE_NOW} />);
    fireEvent.pointerMove(screen.getByTestId("simple-root"));
    const button = await screen.findByRole("button", { name: "全画面" });
    await user.click(button);
    expect(requestFullscreenMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "通常表示" })).toBeInTheDocument();
  });

  it("reveals on interaction, hides after idle, and stays open while focused", () => {
    vi.useFakeTimers();
    render(<Simple initial={initial} serverNowIso={FIXTURE_NOW} />);
    const root = screen.getByTestId("simple-root");
    const dock = screen.getByTestId("simple-header-menu");

    expect(dock).toHaveAttribute("data-menu-visible", "false");
    fireEvent.pointerMove(root);
    expect(dock).toHaveAttribute("data-menu-visible", "true");
    act(() => vi.advanceTimersByTime(2999));
    expect(dock).toHaveAttribute("data-menu-visible", "true");
    act(() => vi.advanceTimersByTime(1));
    expect(dock).toHaveAttribute("data-menu-visible", "false");

    fireEvent.pointerMove(root);
    const periodButton = screen.getByRole("button", { name: "24時間" });
    fireEvent.focus(periodButton);
    act(() => vi.advanceTimersByTime(5000));
    expect(dock).toHaveAttribute("data-menu-visible", "true");
    fireEvent.blur(periodButton, { relatedTarget: null });
    act(() => vi.advanceTimersByTime(3000));
    expect(dock).toHaveAttribute("data-menu-visible", "false");

    fireEvent.pointerMove(root);
    fireEvent.mouseEnter(dock);
    act(() => vi.advanceTimersByTime(5000));
    expect(dock).toHaveAttribute("data-menu-visible", "true");
    fireEvent.mouseLeave(dock);
    act(() => vi.advanceTimersByTime(3000));
    expect(dock).toHaveAttribute("data-menu-visible", "false");

    fireEvent.pointerMove(root);
    fireEvent.click(screen.getByTestId("simple-theme-trigger"));
    act(() => vi.advanceTimersByTime(5000));
    expect(dock).toHaveAttribute("data-menu-visible", "true");
    fireEvent.keyDown(screen.getByTestId("simple-theme-menu"), {
      key: "Escape",
    });

    fireEvent.click(periodButton);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dock).toHaveAttribute("data-menu-visible", "false");
  });

  it("opens the three-state theme menu and returns focus after selection", async () => {
    const user = userEvent.setup();
    render(<Simple initial={initial} serverNowIso={FIXTURE_NOW} />);
    fireEvent.pointerMove(screen.getByTestId("simple-root"));
    const trigger = screen.getByTestId("simple-theme-trigger");
    await user.click(trigger);
    const menu = screen.getByTestId("simple-theme-menu");
    expect(menu).toBeInTheDocument();
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(3);
    const dark = screen.getByRole("menuitemradio", { name: "ダーク" });
    await user.click(dark);
    expect(window.localStorage.getItem("ambient-lapis-theme")).toBe("dark");
    expect(screen.queryByTestId("simple-theme-menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("supports theme menu keyboard navigation and two-stage Escape", async () => {
    const user = userEvent.setup();
    render(<Simple initial={initial} serverNowIso={FIXTURE_NOW} />);
    fireEvent.pointerMove(screen.getByTestId("simple-root"));
    const headerMenu = screen.getByTestId("simple-header-menu");
    const trigger = screen.getByTestId("simple-theme-trigger");
    await user.click(trigger);
    const system = screen.getByRole("menuitemradio", { name: "自動" });
    expect(system).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("menuitemradio", { name: "ライト" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(system).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitemradio", { name: "ダーク" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("simple-theme-menu")).not.toBeInTheDocument();
    expect(headerMenu).toHaveAttribute("data-menu-visible", "true");
    expect(trigger).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(headerMenu).toHaveAttribute("data-menu-visible", "false");
  });

  it.each([
    { key: "Enter", preference: "dark", label: "ダーク" },
    { key: " ", preference: "light", label: "ライト" },
  ])(
    "selects a theme with $key and returns focus",
    ({ key, preference, label }) => {
      render(<Simple initial={initial} serverNowIso={FIXTURE_NOW} />);
      fireEvent.pointerMove(screen.getByTestId("simple-root"));
      const trigger = screen.getByTestId("simple-theme-trigger");
      fireEvent.click(trigger);
      const item = screen.getByRole("menuitemradio", { name: label });
      fireEvent.focus(item);
      fireEvent.keyDown(item, { key });
      expect(window.localStorage.getItem("ambient-lapis-theme")).toBe(
        preference,
      );
      expect(trigger).toHaveAttribute("aria-label", `テーマ: ${label}`);
      expect(screen.queryByTestId("simple-theme-menu")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    },
  );

  it("closes the theme menu on outside pointer interaction", async () => {
    const user = userEvent.setup();
    render(<Simple initial={initial} serverNowIso={FIXTURE_NOW} />);
    fireEvent.pointerMove(screen.getByTestId("simple-root"));
    const trigger = screen.getByTestId("simple-theme-trigger");
    await user.click(trigger);
    expect(screen.getByTestId("simple-theme-menu")).toBeInTheDocument();
    fireEvent.pointerDown(
      screen.getByRole("region", { name: "現在の室内環境" }),
    );
    expect(screen.queryByTestId("simple-theme-menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
