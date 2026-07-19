import { fireEvent, render } from "@testing-library/react";

import { mapAirconSegments, mapEnvironmentSeries } from "@/lib/view-model/map";
import { fixtureScenarios } from "@/test/fixtures";

import { EnvironmentChart } from "./environment-chart";

const chartHarness = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown) => void>();
  const zrHandlers = new Map<string, () => void>();
  const convertToPixel = vi.fn<(finder: unknown, value: unknown) => number>(
    () => 123,
  );
  return {
    handlers,
    zrHandlers,
    dispatchAction: vi.fn(),
    convertToPixel,
    setOption: vi.fn(),
    chart: {
      setOption: vi.fn(),
      resize: vi.fn(),
      dispatchAction: vi.fn(),
      convertToPixel,
      on: vi.fn((name: string, handler: (event: unknown) => void) => {
        handlers.set(name, handler);
      }),
      off: vi.fn((name: string) => {
        handlers.delete(name);
      }),
      getZr: () => ({
        on: (name: string, handler: () => void) =>
          zrHandlers.set(name, handler),
        off: (name: string) => zrHandlers.delete(name),
      }),
      dispose: vi.fn(),
    },
  };
});

vi.mock("@/lib/chart/echarts", () => ({
  echarts: { init: () => chartHarness.chart },
}));

class ResizeObserverMock {
  observe(): void {}
  disconnect(): void {}
}

const NOW = new Date("2026-07-18T12:35:00.000Z");
const series = mapEnvironmentSeries(
  fixtureScenarios.normal.environmentSeries.data,
  NOW,
);
const airconSegments = mapAirconSegments(
  fixtureScenarios.normal.airconSeries.data,
  NOW,
);

beforeEach(() => {
  chartHarness.dispatchAction.mockClear();
  chartHarness.chart.dispatchAction.mockClear();
  chartHarness.convertToPixel.mockClear();
  chartHarness.convertToPixel.mockReturnValue(123);
  chartHarness.handlers.clear();
  chartHarness.zrHandlers.clear();
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("EnvironmentChart simple interactions", () => {
  it("moves through typed selections with arrow keys and clears with Escape", () => {
    const onSelectionChange = vi.fn();
    const { getByRole } = render(
      <EnvironmentChart
        series={series}
        airconSegments={airconSegments}
        range={{
          fromMs: Date.parse("2026-07-18T12:00:00.000Z"),
          toMs: Date.parse("2026-07-18T13:00:00.000Z"),
        }}
        ariaLabel="環境履歴"
        variant="simple"
        onSelectionChange={onSelectionChange}
      />,
    );

    const chart = getByRole("img", { name: "環境履歴" });
    expect(chart).toHaveClass("h-full", "min-h-0");

    fireEvent.keyDown(chart, { key: "ArrowRight" });
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        epochMs: series.points[0]?.time.epochMs,
        point: series.points[0],
        airconSegment: expect.objectContaining({ state: "on" }),
      }),
    );
    expect(chartHarness.chart.dispatchAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "updateAxisPointer",
        xAxisIndex: 0,
        value: series.points[0]?.time.epochMs,
      }),
    );
    expect(chartHarness.chart.dispatchAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "showTip", dataIndex: 0 }),
    );
    const crosshair = chart.querySelector<HTMLElement>(
      "[data-chart-crosshair='true']",
    );
    expect(crosshair).not.toBeNull();
    expect(crosshair).toHaveStyle({ display: "block", left: "123px" });

    fireEvent.keyDown(chart, { key: "Escape" });
    expect(onSelectionChange).toHaveBeenLastCalledWith(null);
    expect(chartHarness.chart.dispatchAction).toHaveBeenLastCalledWith({
      type: "hideTip",
    });
    expect(crosshair).toHaveStyle({ display: "none" });
  });

  it("emits the nearest point from the linked ECharts axis pointer", () => {
    const onSelectionChange = vi.fn();
    const { getByRole } = render(
      <EnvironmentChart
        series={series}
        airconSegments={airconSegments}
        range={{
          fromMs: Date.parse("2026-07-18T12:00:00.000Z"),
          toMs: Date.parse("2026-07-18T13:00:00.000Z"),
        }}
        ariaLabel="環境履歴"
        variant="simple"
        onSelectionChange={onSelectionChange}
      />,
    );

    chartHarness.handlers.get("updateAxisPointer")?.({
      axesInfo: [{ value: Date.parse("2026-07-18T12:24:00.000Z") }],
    });
    expect(onSelectionChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        epochMs: Date.parse("2026-07-18T12:25:00.000Z"),
        point: expect.objectContaining({ remoOnlineState: "online" }),
      }),
    );
    const chart = getByRole("img", { name: "環境履歴" });
    const crosshair = chart.querySelector<HTMLElement>(
      "[data-chart-crosshair='true']",
    );
    expect(crosshair).toHaveStyle({ display: "block", left: "123px" });

    chartHarness.convertToPixel.mockReturnValue(184);
    chartHarness.handlers.get("updateAxisPointer")?.({
      axesInfo: [{ value: Date.parse("2026-07-18T12:30:00.000Z") }],
    });
    expect(crosshair).toHaveStyle({ display: "block", left: "184px" });
  });

  it("does not add a DOM crosshair to the dashboard variant", () => {
    const { getByRole } = render(
      <EnvironmentChart
        series={series}
        airconSegments={airconSegments}
        range={{
          fromMs: Date.parse("2026-07-18T12:00:00.000Z"),
          toMs: Date.parse("2026-07-18T13:00:00.000Z"),
        }}
        ariaLabel="通常履歴"
      />,
    );
    expect(
      getByRole("img", { name: "通常履歴" }).querySelector(
        "[data-chart-crosshair='true']",
      ),
    ).toBeNull();
  });
});
