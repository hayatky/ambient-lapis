import type {
  AirconSegmentViewModel,
  ChartMetricViewModel,
  DisplayTimestamp,
  EnvironmentSeriesViewModel,
} from "@/lib/view-model";

import {
  buildHistoryChartOption,
  extractTooltipEpoch,
  formatHistoryTooltip,
  toRgba,
} from "./options";
import { buildHistoryChartSummary } from "./summary";
import { DEFAULT_CHART_PALETTE } from "./types";

const FIRST_TIME = "2026-07-18T12:00:00.000Z";
const GAP_TIME = "2026-07-18T12:05:00.000Z";
const LAST_TIME = "2026-07-18T12:10:00.000Z";

const series: EnvironmentSeriesViewModel = {
  resolution: "15m",
  points: [
    point(
      FIRST_TIME,
      "2026/07/18 21:00",
      metric(25, 24.5, 25.5),
      metric(50, 48, 52),
    ),
    {
      ...point(GAP_TIME, "2026/07/18 21:05", metric(99), metric(99)),
      gap: true,
      remoOnlineState: "unknown",
    },
    {
      ...point(
        LAST_TIME,
        "2026/07/18 21:10",
        metric(27, 26.5, 27.5),
        metric(55, 54, 56),
      ),
      stale: true,
      remoOnlineState: "offline",
    },
  ],
};

const airconSegments: AirconSegmentViewModel[] = [
  segment(FIRST_TIME, GAP_TIME, "on"),
  segment(GAP_TIME, LAST_TIME, "off"),
  segment(LAST_TIME, "2026-07-18T12:15:00.000Z", "unknown"),
];

describe("buildHistoryChartOption", () => {
  it("builds two honest axes, null gap separators, hollow stale markers, and ON-only areas", () => {
    const option = buildHistoryChartOption({
      series,
      airconSegments,
      palette: DEFAULT_CHART_PALETTE,
      reducedMotion: false,
      showSlider: true,
    });

    expect(option).toMatchObject({
      animation: true,
      yAxis: [
        { name: "温度 °C", position: "left" },
        { name: "湿度 %", position: "right", min: 0, max: 100 },
      ],
      dataZoom: [{ type: "inside" }, { type: "slider" }],
      series: [
        {
          name: "温度",
          yAxisIndex: 0,
          connectNulls: false,
          data: [
            { value: [Date.parse(FIRST_TIME), 25], symbol: "none" },
            { value: [Date.parse(GAP_TIME), null], symbol: "none" },
            {
              value: [Date.parse(LAST_TIME), 27],
              symbol: "circle",
              itemStyle: {
                color: DEFAULT_CHART_PALETTE.surface,
                borderColor: DEFAULT_CHART_PALETTE.temperature,
                borderWidth: 2,
              },
            },
          ],
          markArea: {
            data: [
              [
                { xAxis: Date.parse(FIRST_TIME) },
                { xAxis: Date.parse(GAP_TIME) },
              ],
            ],
          },
        },
        {
          name: "湿度",
          yAxisIndex: 1,
          connectNulls: false,
          data: [
            { value: [Date.parse(FIRST_TIME), 50], symbol: "none" },
            { value: [Date.parse(GAP_TIME), null], symbol: "none" },
            { value: [Date.parse(LAST_TIME), 55], symbol: "circle" },
          ],
        },
      ],
    });
    expect(option).not.toHaveProperty("legend");
  });

  it("uses touch inside zoom without a slider and disables all chart animation for reduced motion", () => {
    const option = buildHistoryChartOption({
      series,
      airconSegments,
      palette: DEFAULT_CHART_PALETTE,
      reducedMotion: true,
      showSlider: false,
    });

    expect(option).toMatchObject({
      animation: false,
      animationDuration: 0,
      animationDurationUpdate: 0,
      dataZoom: [
        {
          type: "inside",
          zoomOnMouseWheel: false,
          moveOnMouseWheel: false,
          moveOnMouseMove: true,
        },
      ],
    });
    expect(option.dataZoom).toHaveLength(1);
  });
});

describe("history chart tooltip", () => {
  it("formats JST values, observation times, Remo state, and Nature Remo recognition state", () => {
    expect(
      formatHistoryTooltip(Date.parse(LAST_TIME), series, airconSegments),
    ).toBe(
      [
        "2026/07/18 21:10",
        "温度 27 °C",
        "温度の計測 2026/07/18 21:09",
        "湿度 55 %",
        "湿度の計測 2026/07/18 21:09",
        "Remo オフライン",
        "エアコン認識 不明",
      ].join("\n"),
    );
  });

  it("extracts an epoch without trusting arbitrary tooltip data", () => {
    expect(extractTooltipEpoch([{ axisValue: Date.parse(FIRST_TIME) }])).toBe(
      Date.parse(FIRST_TIME),
    );
    expect(extractTooltipEpoch({ value: [Date.parse(GAP_TIME), null] })).toBe(
      Date.parse(GAP_TIME),
    );
    expect(extractTooltipEpoch({ value: "unexpected" })).toBeNull();
  });
});

describe("buildHistoryChartSummary", () => {
  it("uses aggregate extrema, ignores gaps, and selects the latest non-null value", () => {
    expect(buildHistoryChartSummary(series)).toEqual({
      temperature: { minimum: 24.5, maximum: 27.5, latest: 27 },
      humidity: { minimum: 48, maximum: 56, latest: 55 },
    });
  });

  it("does not invent values for an entirely empty range", () => {
    expect(
      buildHistoryChartSummary({
        resolution: "raw",
        points: [
          point(FIRST_TIME, "2026/07/18 21:00", metric(null), metric(null)),
        ],
      }),
    ).toEqual({
      temperature: { minimum: null, maximum: null, latest: null },
      humidity: { minimum: null, maximum: null, latest: null },
    });
  });
});

describe("toRgba", () => {
  it("adds an explicit alpha channel to CSS hex colors", () => {
    expect(toRgba("#315fd5", 0.1)).toBe("rgba(49, 95, 213, 0.1)");
  });
});

function point(
  iso: string,
  label: string,
  temperature: ChartMetricViewModel,
  humidity: ChartMetricViewModel,
) {
  return {
    time: timestamp(iso, label),
    temperature,
    humidity,
    remoOnlineState: "online" as const,
    gap: false,
    stale: false,
  };
}

function metric(
  value: number | null,
  minimum: number | null = null,
  maximum: number | null = null,
): ChartMetricViewModel {
  return {
    value,
    minimum,
    maximum,
    observedAt:
      value === null
        ? null
        : timestamp("2026-07-18T12:09:00.000Z", "2026/07/18 21:09"),
    sampleCount: value === null ? 0 : 3,
  };
}

function segment(
  from: string,
  to: string,
  state: AirconSegmentViewModel["state"],
): AirconSegmentViewModel {
  return {
    from: timestamp(from, from),
    to: timestamp(to, to),
    state,
    mode: null,
    targetTemperatureC: null,
  };
}

function timestamp(iso: string, label: string): DisplayTimestamp {
  return {
    iso,
    epochMs: Date.parse(iso),
    label,
    ageSeconds: 0,
  };
}
