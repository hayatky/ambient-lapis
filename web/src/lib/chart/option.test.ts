import { mapAirconSegments, mapEnvironmentSeries } from "@/lib/view-model/map";
import { fixtureScenarios } from "@/test/fixtures";

import {
  buildChartOption,
  computeKioskPanelLayout,
  computePanelLayout,
  humidityAxisBounds,
  selectNearestChartData,
  summarizeSeries,
  targetTemperatureLineData,
} from "./option";
import { FALLBACK_TOKENS, withAlpha } from "./tokens";

const NOW = new Date("2026-07-18T12:35:00.000Z");
const RANGE = {
  rangeFromMs: Date.parse("2026-07-18T12:00:00.000Z"),
  rangeToMs: Date.parse("2026-07-18T13:00:00.000Z"),
};

const rawSeries = mapEnvironmentSeries(
  fixtureScenarios.normal.environmentSeries.data,
  NOW,
);
const segments = mapAirconSegments(
  fixtureScenarios.normal.airconSeries.data,
  NOW,
);

function build(
  overrides: Partial<Parameters<typeof buildChartOption>[0]> = {},
) {
  return buildChartOption({
    series: rawSeries,
    airconSegments: segments,
    tokens: FALLBACK_TOKENS,
    pointerType: "fine",
    reducedMotion: false,
    heightPx: 500,
    ...RANGE,
    ...overrides,
  });
}

interface LineSeries {
  name: string;
  type: string;
  connectNulls?: boolean;
  data: unknown[];
  xAxisIndex: number;
  yAxisIndex: number;
}

function seriesOf(option: ReturnType<typeof build>): LineSeries[] {
  return option.series as unknown as LineSeries[];
}

describe("buildChartOption", () => {
  it("stacks temperature and humidity on separate grids (no dual axis)", () => {
    const option = build();
    const [temperature, humidity, targetTemperature, ribbon] = seriesOf(option);
    expect(temperature?.type).toBe("line");
    expect(humidity?.type).toBe("line");
    expect(targetTemperature?.type).toBe("line");
    expect(ribbon?.type).toBe("custom");
    expect(temperature?.xAxisIndex).toBe(0);
    expect(temperature?.yAxisIndex).toBe(0);
    expect(humidity?.xAxisIndex).toBe(1);
    expect(humidity?.yAxisIndex).toBe(1);
    expect(targetTemperature?.xAxisIndex).toBe(0);
    expect(targetTemperature?.yAxisIndex).toBe(0);
    expect(ribbon?.xAxisIndex).toBe(2);
    expect((option.grid as unknown[]).length).toBe(3);
  });

  it("pins every time axis to the requested range", () => {
    const option = build();
    const axes = option.xAxis as { min: number; max: number }[];
    expect(axes).toHaveLength(3);
    for (const axis of axes) {
      expect(axis.min).toBe(RANGE.rangeFromMs);
      expect(axis.max).toBe(RANGE.rangeToMs);
    }
  });

  it("uses identical horizontal plot bounds for every grid", () => {
    const option = build();
    const grids = option.grid as { left: number; right: number }[];
    expect(grids).toHaveLength(3);
    const horizontalBounds = grids.map(({ left, right }) => ({ left, right }));
    expect(horizontalBounds[1]).toEqual(horizontalBounds[0]);
    expect(horizontalBounds[2]).toEqual(horizontalBounds[0]);
  });

  it("never connects nulls and keeps gap points null", () => {
    const option = build();
    const [temperature, humidity] = seriesOf(option);
    expect(temperature?.connectNulls).toBe(false);
    expect(humidity?.connectNulls).toBe(false);
    // The second fixture point is a gap.
    const gapValue = temperature?.data[1] as [number, number | null];
    expect(gapValue[1]).toBeNull();
  });

  it("paints ribbon segments only for on and unknown states", () => {
    const option = build();
    const ribbon = seriesOf(option)[3] as unknown as {
      data: { value: [number, number, number] }[];
    };
    // fixture has one on segment and one gap segment: only on is painted.
    expect(ribbon.data).toHaveLength(1);
    expect(ribbon.data[0]?.value[2]).toBe(1);
    expect(ribbon.data[0]?.value[0]).toBe(
      Date.parse("2026-07-18T12:00:00.000Z"),
    );
  });

  it("renders unchanged readings without warning marker objects", () => {
    const option = build();
    const [temperature] = seriesOf(option);
    expect(temperature?.data.every(Array.isArray)).toBe(true);
  });

  it("draws a subtle target-temperature line only for recognized on segments", () => {
    const option = build();
    const target = seriesOf(option)[2] as LineSeries & {
      connectNulls: boolean;
      showSymbol: boolean;
      lineStyle: { type: string; width: number };
    };
    expect(target.name).toBe("Nature Remo認識設定温度");
    expect(target.connectNulls).toBe(false);
    expect(target.showSymbol).toBe(false);
    expect(target.lineStyle).toMatchObject({ type: "dashed", width: 1.25 });
    expect(target.data).toEqual([
      [Date.parse("2026-07-18T12:00:00.000Z"), 26],
      [Date.parse("2026-07-18T12:30:00.000Z"), 26],
      [Date.parse("2026-07-18T12:30:00.000Z"), null],
    ]);
  });

  it("disables animation under reduced motion", () => {
    expect(build({ reducedMotion: true }).animation).toBe(false);
    expect(build({ reducedMotion: false }).animation).toBe(true);
  });

  it("uses pinch-only inside zoom on all grids and no slider", () => {
    const zooms = build().dataZoom as {
      type: string;
      xAxisIndex: number[];
      zoomOnMouseWheel: boolean;
      moveOnMouseMove: boolean;
    }[];
    expect(zooms).toHaveLength(1);
    expect(zooms[0]?.type).toBe("inside");
    expect(zooms[0]?.xAxisIndex).toEqual([0, 1, 2]);
    expect(zooms[0]?.zoomOnMouseWheel).toBe(false);
    expect(zooms[0]?.moveOnMouseMove).toBe(false);
  });

  it("pins tooltips by tap on coarse pointers and hover on fine", () => {
    const fine = build({ pointerType: "fine" }).tooltip as {
      triggerOn: string;
      showContent: boolean;
    };
    expect(fine.triggerOn).toBe("mousemove");
    expect(fine.showContent).toBe(true);
    const coarse = build({ pointerType: "coarse" }).tooltip as {
      triggerOn: string;
      showContent: boolean;
    };
    expect(coarse.triggerOn).toBe("click");
    expect(coarse.showContent).toBe(true);
  });

  it("suppresses floating tooltip content only in kiosk mode", () => {
    const dashboard = build({ variant: "dashboard" }).tooltip as {
      showContent: boolean;
      axisPointer: { type: string };
    };
    const kiosk = build({ variant: "kiosk" }).tooltip as {
      showContent: boolean;
      axisPointer: { type: string };
    };
    const kioskCoarse = build({
      variant: "kiosk",
      pointerType: "coarse",
    }).tooltip as { showContent: boolean };
    expect(dashboard.showContent).toBe(true);
    expect(kiosk.showContent).toBe(false);
    expect(kioskCoarse.showContent).toBe(false);
    // The axis pointer remains active so the chart can continue to drive the
    // kiosk crosshair and selected-value panel.
    expect(kiosk.axisPointer.type).toBe("line");
  });

  it("formats a Japanese tooltip with measurement details", () => {
    const option = build();
    const tooltip = option.tooltip as {
      formatter: (params: unknown) => string;
    };
    const html = tooltip.formatter([
      { axisValue: Date.parse("2026-07-18T12:25:00.000Z") },
    ]);
    expect(html).toContain("温度");
    expect(html).toContain("26.1°C");
    expect(html).toContain("湿度");
    expect(html).toContain("57%");
    expect(html).toContain("Remo: オンライン");
    expect(html).toContain("エアコン認識: 運転中");
    expect(html).toContain("認識設定温度");
    expect(html).toContain("室温−設定 +0.1°C");
  });

  it("reports gaps honestly in the tooltip", () => {
    const option = build();
    const tooltip = option.tooltip as {
      formatter: (params: unknown) => string;
    };
    const html = tooltip.formatter([
      { axisValue: Date.parse("2026-07-18T12:30:00.000Z") },
    ]);
    expect(html).toContain("データなし(欠損)");
  });
});

describe("computePanelLayout", () => {
  it("keeps the temperature panel larger than the humidity panel", () => {
    const layout = computePanelLayout(500);
    expect(layout.temperatureHeight).toBeGreaterThan(layout.humidityHeight);
    expect(layout.ribbonHeight).toBe(18);
    expect(layout.ribbonTop + layout.ribbonHeight).toBeLessThan(500);
  });

  it("never collapses below a minimum plot area", () => {
    const layout = computePanelLayout(100);
    expect(layout.temperatureHeight + layout.humidityHeight).toBe(120);
  });
});

describe("kiosk chart variant", () => {
  it("uses viewport-safe vertical space and aligned independent grids", () => {
    const option = build({ variant: "kiosk", widthPx: 390, heightPx: 844 });
    const grids = option.grid as {
      left: number;
      right: number;
      top: number;
      height: number;
    }[];
    expect(grids).toHaveLength(3);
    expect(grids[0]?.top).toBe(266);
    expect(grids.map(({ left, right }) => ({ left, right }))).toEqual([
      { left: 28, right: 18 },
      { left: 28, right: 18 },
      { left: 28, right: 18 },
    ]);
    const ribbon = grids[2];
    expect((ribbon?.top ?? 0) + (ribbon?.height ?? 0)).toBeLessThanOrEqual(
      844 - 160,
    );
    expect(option.title).toEqual([]);
  });

  it("starts below the full top overlay at every supported viewport", () => {
    const compact = computeKioskPanelLayout(844, 390);
    const tablet = computeKioskPanelLayout(1024, 768);
    const desktop = computeKioskPanelLayout(900, 1440);
    expect(compact.temperatureTop).toBe(252);
    expect(tablet.temperatureTop).toBe(252);
    expect(desktop.temperatureTop).toBe(252);
    expect(compact.temperatureHeight).toBeGreaterThan(compact.humidityHeight);
  });

  it("uses a stronger linked crosshair only in kiosk mode", () => {
    const dashboardPointer = build().axisPointer as {
      lineStyle: { opacity: number; width: number };
    };
    const kiosk = build({ variant: "kiosk" });
    const kioskPointer = kiosk.axisPointer as {
      lineStyle: { opacity: number; width: number };
    };
    const kioskTooltip = kiosk.tooltip as {
      axisPointer: { lineStyle: { opacity: number; width: number } };
    };
    expect(dashboardPointer.lineStyle).toMatchObject({
      opacity: 0.45,
      width: 1,
    });
    expect(kioskPointer.lineStyle).toMatchObject({ opacity: 0.82, width: 1.5 });
    expect(kioskTooltip.axisPointer.lineStyle).toMatchObject({
      opacity: 0.82,
      width: 1.5,
    });
  });

  it("preserves target-temperature and ribbon honesty rules", () => {
    const option = build({ variant: "kiosk", widthPx: 1440, heightPx: 900 });
    const target = seriesOf(option)[2];
    const ribbon = seriesOf(option)[3] as unknown as {
      data: { value: [number, number, number] }[];
    };
    expect(target?.connectNulls).toBe(false);
    expect(target?.data).toContainEqual([
      Date.parse("2026-07-18T12:30:00.000Z"),
      null,
    ]);
    expect(ribbon.data).toHaveLength(1);
  });
});

describe("selectNearestChartData", () => {
  it("selects the nearest environmental point and its aircon interval", () => {
    const selected = selectNearestChartData(
      Date.parse("2026-07-18T12:24:00.000Z"),
      rawSeries.points,
      segments,
    );
    expect(selected.epochMs).toBe(Date.parse("2026-07-18T12:25:00.000Z"));
    expect(selected.point?.temperature.value).toBe(26.1);
    expect(selected.point?.remoOnlineState).toBe("online");
    expect(selected.airconSegment).toMatchObject({
      state: "on",
      targetTemperatureC: 26,
    });
  });

  it("keeps a gap point and missing interval explicit", () => {
    const selected = selectNearestChartData(
      Date.parse("2026-07-18T12:30:00.000Z"),
      rawSeries.points,
      [],
    );
    expect(selected.point?.gap).toBe(true);
    expect(selected.airconSegment).toBeNull();
  });

  it("returns the requested time with null data when the series is empty", () => {
    const epochMs = Date.parse("2026-07-18T12:30:00.000Z");
    expect(selectNearestChartData(epochMs, [], [])).toEqual({
      epochMs,
      point: null,
      airconSegment: null,
    });
  });
});

describe("humidityAxisBounds", () => {
  it("snaps the extent to 10s with a minimum span of 20", () => {
    expect(humidityAxisBounds(rawSeries.points)).toEqual({ min: 40, max: 60 });
  });

  it("falls back to 0-100 when the range has no values", () => {
    expect(humidityAxisBounds([])).toEqual({ min: 0, max: 100 });
  });
});

describe("summarizeSeries", () => {
  it("summarizes minimum, maximum and latest values ignoring gaps", () => {
    const summary = summarizeSeries(rawSeries);
    expect(summary.temperature).not.toBeNull();
    expect(summary.temperature?.minimum).toBe(26.1);
    expect(summary.temperature?.maximum).toBe(26.1);
    expect(summary.temperature?.latest).toBe(26.1);
    expect(summary.humidity?.latest).toBe(57);
    expect(summary.targetTemperature).toBeNull();
  });

  it("summarizes the latest recognized target and room delta", () => {
    const summary = summarizeSeries(rawSeries, segments);
    expect(summary.targetTemperature).toMatchObject({
      latest: 26,
      roomDelta: 0.1,
      roomValueKind: "室温",
    });
  });

  it("returns null metrics when the range has no valid values", () => {
    const empty = summarizeSeries({ resolution: "raw", points: [] });
    expect(empty.temperature).toBeNull();
    expect(empty.humidity).toBeNull();
  });
});

describe("targetTemperatureLineData", () => {
  it("clips on segments and excludes off, unknown, gaps, and null targets", () => {
    const from = Date.parse("2026-07-18T12:05:00.000Z");
    const to = Date.parse("2026-07-18T12:45:00.000Z");
    const base = segments[0];
    if (!base) throw new Error("fixture segment missing");
    const data = targetTemperatureLineData(
      [
        base,
        {
          ...base,
          from: { ...base.from, epochMs: Date.parse("2026-07-18T12:30:00Z") },
          to: { ...base.to, epochMs: Date.parse("2026-07-18T12:40:00Z") },
          state: "off",
          targetTemperatureC: 24,
        },
        {
          ...base,
          from: { ...base.from, epochMs: Date.parse("2026-07-18T12:40:00Z") },
          to: { ...base.to, epochMs: Date.parse("2026-07-18T12:50:00Z") },
          targetTemperatureC: null,
        },
      ],
      from,
      to,
    );
    expect(data).toEqual([
      [from, 26],
      [Date.parse("2026-07-18T12:30:00.000Z"), 26],
      [Date.parse("2026-07-18T12:30:00.000Z"), null],
    ]);
  });
});

describe("withAlpha", () => {
  it("converts hex colors to rgba", () => {
    expect(withAlpha("#6379c8", 0.14)).toBe("rgba(99, 121, 200, 0.14)");
  });

  it("passes through non-hex values unchanged", () => {
    expect(withAlpha("var(--ribbon-on)", 0.14)).toBe("var(--ribbon-on)");
  });
});
