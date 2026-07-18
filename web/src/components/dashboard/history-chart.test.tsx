import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { EChartsType } from "echarts/core";

import type {
  AirconSegmentViewModel,
  ChartMetricViewModel,
  DisplayTimestamp,
  EnvironmentSeriesViewModel,
} from "@/lib/view-model";

import { HistoryChart } from "./history-chart";

const chartMocks = vi.hoisted(() => ({
  setOption: vi.fn(),
  resize: vi.fn(),
  dispatchAction: vi.fn(),
  dispose: vi.fn(),
  init: vi.fn(),
  load: vi.fn(),
}));

vi.mock("@/lib/chart", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/chart")>("@/lib/chart");
  return {
    ...actual,
    loadECharts: chartMocks.load,
  };
});

let resizeCallback: ResizeObserverCallback | null = null;
const observe = vi.fn();
const disconnect = vi.fn();

class ResizeObserverMock {
  constructor(callback: ResizeObserverCallback) {
    resizeCallback = callback;
  }

  observe = observe;
  unobserve = vi.fn();
  disconnect = disconnect;
}

const SERIES: EnvironmentSeriesViewModel = {
  resolution: "raw",
  points: [
    point("2026-07-18T12:00:00.000Z", 25, 50),
    point("2026-07-18T12:05:00.000Z", 27, 55),
  ],
};

const SEGMENTS: AirconSegmentViewModel[] = [
  {
    from: timestamp("2026-07-18T12:00:00.000Z"),
    to: timestamp("2026-07-18T12:05:00.000Z"),
    state: "on",
    mode: "cool",
    targetTemperatureC: 26,
  },
];

describe("HistoryChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resizeCallback = null;
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("pointer: fine"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    chartMocks.init.mockReturnValue({
      setOption: chartMocks.setOption,
      resize: chartMocks.resize,
      dispatchAction: chartMocks.dispatchAction,
      dispose: chartMocks.dispose,
    } as unknown as EChartsType);
    chartMocks.load.mockResolvedValue({ init: chartMocks.init });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads ECharts after mount and exposes a keyboard-reachable text summary", async () => {
    const { unmount } = render(
      <HistoryChart series={SERIES} airconSegments={SEGMENTS} />,
    );

    await waitFor(() => expect(chartMocks.load).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(chartMocks.setOption).toHaveBeenCalled());

    expect(
      screen.getByRole("heading", { name: "温度と湿度の履歴" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("tabindex", "0");

    const summary = screen.getByLabelText("表示期間内の最低、最高、最新値");
    expect(summary).toHaveAttribute("tabindex", "0");
    const temperature = within(summary).getByText("温度").closest("dl");
    if (!temperature) throw new Error("temperature summary was not rendered");
    expect(within(temperature).getByText("25.0")).toBeInTheDocument();
    expect(within(temperature).getAllByText("27.0")).toHaveLength(2);
    expect(observe).toHaveBeenCalledWith(screen.getByRole("img"));

    resizeCallback?.([], new ResizeObserverMock(() => undefined));
    expect(chartMocks.resize).toHaveBeenCalled();

    fireEvent.pointerDown(document.body);
    expect(chartMocks.dispatchAction).toHaveBeenCalledWith({ type: "hideTip" });

    unmount();
    expect(disconnect).toHaveBeenCalled();
    expect(chartMocks.dispose).toHaveBeenCalled();
  });

  it("keeps last-good chart data visible beside a sanitized retryable error", async () => {
    const onRetry = vi.fn();
    render(
      <HistoryChart
        series={SERIES}
        airconSegments={SEGMENTS}
        error="履歴を更新できませんでした"
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "履歴を更新できませんでした",
    );
    expect(screen.getByRole("img")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "履歴を再取得" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(chartMocks.load).toHaveBeenCalled());
  });

  it("shows honest loading and empty states without mounting a chart", () => {
    const { rerender } = render(
      <HistoryChart series={null} airconSegments={[]} isLoading />,
    );

    expect(screen.getByText("履歴を読み込んでいます")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();

    rerender(<HistoryChart series={null} airconSegments={[]} />);
    expect(
      screen.getByText("この期間の収集データはまだありません。"),
    ).toBeInTheDocument();
    expect(screen.getByText(/値を補わず/)).toBeInTheDocument();
    expect(chartMocks.load).not.toHaveBeenCalled();
  });
});

function point(iso: string, temperature: number, humidity: number) {
  return {
    time: timestamp(iso),
    temperature: metric(temperature, iso),
    humidity: metric(humidity, iso),
    remoOnlineState: "online" as const,
    gap: false,
    stale: false,
  };
}

function metric(value: number, iso: string): ChartMetricViewModel {
  return {
    value,
    minimum: null,
    maximum: null,
    observedAt: timestamp(iso),
    sampleCount: null,
  };
}

function timestamp(iso: string): DisplayTimestamp {
  return {
    iso,
    epochMs: Date.parse(iso),
    label: "2026/07/18 21:00",
    ageSeconds: 0,
  };
}
