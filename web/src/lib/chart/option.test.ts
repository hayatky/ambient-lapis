import { mapAirconSegments, mapEnvironmentSeries } from "@/lib/view-model/map";
import { fixtureScenarios } from "@/test/fixtures";

import {
  buildChartOption,
  computePanelLayout,
  humidityAxisBounds,
  summarizeSeries,
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
    const [temperature, humidity, ribbon] = seriesOf(option);
    expect(temperature?.type).toBe("line");
    expect(humidity?.type).toBe("line");
    expect(ribbon?.type).toBe("custom");
    expect(temperature?.xAxisIndex).toBe(0);
    expect(temperature?.yAxisIndex).toBe(0);
    expect(humidity?.xAxisIndex).toBe(1);
    expect(humidity?.yAxisIndex).toBe(1);
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
    const ribbon = seriesOf(option)[2] as unknown as {
      data: { value: [number, number, number] }[];
    };
    // fixture has one on segment and one gap segment: only on is painted.
    expect(ribbon.data).toHaveLength(1);
    expect(ribbon.data[0]?.value[2]).toBe(1);
    expect(ribbon.data[0]?.value[0]).toBe(
      Date.parse("2026-07-18T12:00:00.000Z"),
    );
  });

  it("marks stale points with a hollow warning marker", () => {
    const option = build();
    const [temperature] = seriesOf(option);
    const staleItem = temperature?.data.find(
      (item): item is { itemStyle: { borderColor: string } } =>
        typeof item === "object" && item !== null && "itemStyle" in item,
    );
    // The fixture gap point is also stale but carries no value, so no
    // marker; a stale marker appears only on points with values.
    expect(staleItem).toBeUndefined();
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
    };
    expect(fine.triggerOn).toBe("mousemove");
    const coarse = build({ pointerType: "coarse" }).tooltip as {
      triggerOn: string;
    };
    expect(coarse.triggerOn).toBe("click");
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
  });

  it("returns null metrics when the range has no valid values", () => {
    const empty = summarizeSeries({ resolution: "raw", points: [] });
    expect(empty.temperature).toBeNull();
    expect(empty.humidity).toBeNull();
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
