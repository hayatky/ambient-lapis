import { fixtureScenarios } from "@/test/fixtures";
import { mapAirconSegments, mapEnvironmentSeries } from "@/lib/view-model/map";

import { buildChartOption, summarizeSeries } from "./option";
import { FALLBACK_TOKENS, withAlpha } from "./tokens";

const NOW = new Date("2026-07-18T12:35:00.000Z");

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
    ...overrides,
  });
}

interface LineSeries {
  name: string;
  connectNulls: boolean;
  data: unknown[];
  markArea?: { data: unknown[][] };
  yAxisIndex: number;
}

function seriesOf(option: ReturnType<typeof build>): LineSeries[] {
  return option.series as unknown as LineSeries[];
}

describe("buildChartOption", () => {
  it("never connects nulls and keeps gap points null", () => {
    const option = build();
    const [temperature, humidity] = seriesOf(option);
    expect(temperature?.connectNulls).toBe(false);
    expect(humidity?.connectNulls).toBe(false);
    // The second fixture point is a gap.
    const gapValue = temperature?.data[1] as [number, number | null];
    expect(gapValue[1]).toBeNull();
  });

  it("draws background bands only for ON segments", () => {
    const option = build();
    const [temperature] = seriesOf(option);
    // fixture has one on segment and one gap segment
    expect(temperature?.markArea?.data).toHaveLength(1);
    const band = temperature?.markArea?.data[0] as [
      { xAxis: number },
      { xAxis: number },
    ];
    expect(band[0].xAxis).toBe(Date.parse("2026-07-18T12:00:00.000Z"));
  });

  it("assigns temperature and humidity to separate value axes", () => {
    const option = build();
    const [temperature, humidity] = seriesOf(option);
    expect(temperature?.yAxisIndex).toBe(0);
    expect(humidity?.yAxisIndex).toBe(1);
    const axes = option.yAxis as { name: string }[];
    expect(axes[0]?.name).toBe("°C");
    expect(axes[1]?.name).toBe("%");
  });

  it("disables animation under reduced motion", () => {
    expect(build({ reducedMotion: true }).animation).toBe(false);
    expect(build({ reducedMotion: false }).animation).toBe(true);
  });

  it("uses an explicit slider for fine pointers and pinch/drag for coarse", () => {
    const fine = build({ pointerType: "fine" }).dataZoom as {
      type: string;
    }[];
    expect(fine[0]?.type).toBe("slider");
    const coarse = build({ pointerType: "coarse" }).dataZoom as {
      type: string;
      zoomOnMouseWheel: boolean;
    }[];
    expect(coarse[0]?.type).toBe("inside");
    expect(coarse[0]?.zoomOnMouseWheel).toBe(false);
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
    expect(withAlpha("var(--aircon-on)", 0.14)).toBe("var(--aircon-on)");
  });
});
