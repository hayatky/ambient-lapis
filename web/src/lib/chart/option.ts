// Pure ECharts option builder for the environment history chart.
// Keeping this free of React and DOM access makes the chart's honesty
// rules (broken lines on gaps, no bands for unknown, stale markers)
// unit-testable.

import type { EChartsOption, SeriesOption } from "echarts";

import type {
  AirconSegmentViewModel,
  EnvironmentChartPointViewModel,
  EnvironmentSeriesViewModel,
} from "@/lib/view-model";

import { withAlpha, type ChartTokens } from "./tokens";

export interface ChartBuildInput {
  series: EnvironmentSeriesViewModel;
  airconSegments: AirconSegmentViewModel[];
  tokens: ChartTokens;
  pointerType: "fine" | "coarse";
  reducedMotion: boolean;
}

const HOUR_MS = 3_600_000;

const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const dayFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const REMO_STATE_LABELS: Record<
  EnvironmentChartPointViewModel["remoOnlineState"],
  string
> = {
  online: "オンライン",
  offline: "オフライン",
  mixed: "混在",
  unknown: "不明",
};

const SEGMENT_STATE_LABELS: Record<AirconSegmentViewModel["state"], string> = {
  on: "運転中",
  off: "停止",
  unknown: "不明",
  gap: "データなし",
};

type LineDataItem =
  | [number, number | null]
  | {
      value: [number, number | null];
      symbol: string;
      symbolSize: number;
      itemStyle: Record<string, unknown>;
    };

function lineData(
  points: EnvironmentChartPointViewModel[],
  metric: "temperature" | "humidity",
  color: string,
  warningColor: string,
): LineDataItem[] {
  return points.map((point) => {
    const value: [number, number | null] = [
      point.time.epochMs,
      point.gap ? null : point[metric].value,
    ];
    if (point.stale && !point.gap && point[metric].value !== null) {
      // Stale readings stay visible but are marked with a hollow
      // warning-colored point; the tooltip repeats this in text.
      return {
        value,
        symbol: "circle",
        symbolSize: 7,
        itemStyle: {
          color: "transparent",
          borderColor: warningColor,
          borderWidth: 1.5,
        },
      };
    }
    return value;
  });
}

function spanOf(points: EnvironmentChartPointViewModel[]): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) {
    return 0;
  }
  return last.time.epochMs - first.time.epochMs;
}

export function buildChartOption(input: ChartBuildInput): EChartsOption {
  const { series, airconSegments, tokens, pointerType, reducedMotion } = input;
  const points = series.points;
  const span = spanOf(points);
  const pointByTime = new Map<number, EnvironmentChartPointViewModel>();
  for (const point of points) {
    pointByTime.set(point.time.epochMs, point);
  }

  const onSegments = airconSegments.filter((segment) => segment.state === "on");
  const markAreaData = onSegments.map(
    (segment): [{ xAxis: number }, { xAxis: number }] => [
      { xAxis: segment.from.epochMs },
      { xAxis: segment.to.epochMs },
    ],
  );

  const axisLabelFormatter = (value: number): string =>
    span <= 48 * HOUR_MS
      ? timeFormatter.format(value)
      : dayFormatter.format(value);

  const temperatureSeries: SeriesOption = {
    name: "温度",
    type: "line",
    yAxisIndex: 0,
    showSymbol: true,
    symbol: "circle",
    symbolSize: 0,
    connectNulls: false,
    lineStyle: { color: tokens.temperature, width: 2 },
    itemStyle: { color: tokens.temperature },
    emphasis: { disabled: true },
    data: lineData(points, "temperature", tokens.temperature, tokens.warning),
    markArea: {
      silent: true,
      itemStyle: { color: withAlpha(tokens.airconOn, 0.14) },
      data: markAreaData,
    },
    z: 3,
  };

  const humiditySeries: SeriesOption = {
    name: "湿度",
    type: "line",
    yAxisIndex: 1,
    showSymbol: true,
    symbol: "circle",
    symbolSize: 0,
    connectNulls: false,
    lineStyle: { color: tokens.humidity, width: 2 },
    itemStyle: { color: tokens.humidity },
    emphasis: { disabled: true },
    data: lineData(points, "humidity", tokens.humidity, tokens.warning),
    z: 2,
  };

  return {
    animation: !reducedMotion,
    animationDuration: 200,
    animationEasing: "quadraticOut",
    grid: {
      left: 48,
      right: 48,
      top: 32,
      bottom: pointerType === "fine" ? 64 : 28,
      containLabel: false,
    },
    xAxis: {
      type: "time",
      axisLine: { lineStyle: { color: tokens.borderSubtle } },
      axisTick: { show: false },
      axisLabel: {
        color: tokens.textSecondary,
        fontSize: 11,
        formatter: axisLabelFormatter,
        hideOverlap: true,
      },
      splitLine: { show: false },
    },
    yAxis: [
      {
        type: "value",
        name: "°C",
        nameGap: 12,
        nameTextStyle: { color: tokens.textSecondary, fontSize: 11 },
        scale: true,
        axisLabel: { color: tokens.textSecondary, fontSize: 11 },
        splitLine: {
          lineStyle: { color: tokens.borderSubtle, opacity: 0.6 },
        },
        splitNumber: 4,
      },
      {
        type: "value",
        name: "%",
        nameGap: 12,
        nameTextStyle: { color: tokens.textSecondary, fontSize: 11 },
        scale: true,
        axisLabel: { color: tokens.textSecondary, fontSize: 11 },
        splitLine: { show: false },
        splitNumber: 4,
      },
    ],
    tooltip: {
      trigger: "axis",
      triggerOn: pointerType === "fine" ? "mousemove" : "click",
      confine: true,
      backgroundColor: tokens.bgSurface,
      borderColor: tokens.borderSubtle,
      textStyle: { color: tokens.textPrimary, fontSize: 12 },
      extraCssText: "border-radius: 12px; padding: 10px 12px;",
      axisPointer: {
        type: "line",
        lineStyle: { color: tokens.textSecondary, opacity: 0.4 },
      },
      formatter: (params: unknown): string => {
        const list = Array.isArray(params) ? params : [params];
        const first = list[0] as { axisValue?: number } | undefined;
        const epochMs = first?.axisValue;
        if (typeof epochMs !== "number") {
          return "";
        }
        const point = pointByTime.get(epochMs);
        return formatTooltip(epochMs, point, airconSegments, tokens);
      },
    },
    dataZoom:
      pointerType === "fine"
        ? [
            {
              type: "slider",
              height: 24,
              bottom: 12,
              borderColor: tokens.borderSubtle,
              fillerColor: withAlpha(tokens.accent, 0.1),
              handleStyle: { color: tokens.bgSurface },
              moveHandleSize: 0,
              dataBackground: {
                lineStyle: { color: tokens.borderSubtle },
                areaStyle: { color: withAlpha(tokens.borderSubtle, 0.4) },
              },
              textStyle: { color: tokens.textSecondary, fontSize: 10 },
            },
          ]
        : [
            {
              type: "inside",
              zoomOnMouseWheel: false,
              moveOnMouseWheel: false,
              moveOnMouseMove: true,
              zoomLock: false,
            },
          ],
    series: [temperatureSeries, humiditySeries],
  };
}

function formatTooltip(
  epochMs: number,
  point: EnvironmentChartPointViewModel | undefined,
  airconSegments: AirconSegmentViewModel[],
  tokens: ChartTokens,
): string {
  const rows: string[] = [];
  rows.push(
    `<div style="font-weight:600;margin-bottom:4px;">${dateTimeFormatter.format(epochMs)}</div>`,
  );
  if (!point || point.gap) {
    rows.push(
      `<div style="color:${tokens.textSecondary};">データなし(欠損)</div>`,
    );
  } else {
    const staleNote = point.stale
      ? ` <span style="color:${tokens.warning};">(古い値)</span>`
      : "";
    rows.push(
      metricRow(
        "温度",
        tokens.temperature,
        point.temperature.value,
        "°C",
        1,
        staleNote,
      ),
    );
    rows.push(
      metricRow(
        "湿度",
        tokens.humidity,
        point.humidity.value,
        "%",
        0,
        staleNote,
      ),
    );
    if (point.temperature.observedAt) {
      rows.push(
        `<div style="color:${tokens.textSecondary};">温度計測 ${timeFormatter.format(point.temperature.observedAt.epochMs)} / 湿度計測 ${
          point.humidity.observedAt
            ? timeFormatter.format(point.humidity.observedAt.epochMs)
            : "--"
        }</div>`,
      );
    }
    rows.push(
      `<div style="color:${tokens.textSecondary};">Remo: ${REMO_STATE_LABELS[point.remoOnlineState]}</div>`,
    );
  }
  const segment = airconSegments.find(
    (candidate) =>
      candidate.from.epochMs <= epochMs && epochMs < candidate.to.epochMs,
  );
  if (segment) {
    const detail =
      segment.state === "on"
        ? `${SEGMENT_STATE_LABELS.on}${segment.mode ? ` / ${segment.mode}` : ""}${
            segment.targetTemperatureC !== null
              ? ` / 設定 ${segment.targetTemperatureC.toFixed(1)}°C`
              : ""
          }`
        : SEGMENT_STATE_LABELS[segment.state];
    rows.push(
      `<div style="color:${tokens.textSecondary};">エアコン認識: ${detail}</div>`,
    );
  }
  return rows.join("");
}

function metricRow(
  label: string,
  color: string,
  value: number | null,
  unit: string,
  digits: number,
  staleNote: string,
): string {
  const display = value === null ? "--" : value.toFixed(digits);
  return `<div style="display:flex;align-items:center;gap:6px;"><span style="display:inline-block;width:10px;height:3px;border-radius:2px;background:${color};"></span>${label} <span style="font-weight:600;">${display}${unit}</span>${staleNote}</div>`;
}

export interface SeriesSummary {
  temperature: MetricSummary | null;
  humidity: MetricSummary | null;
}

export interface MetricSummary {
  minimum: number;
  maximum: number;
  latest: number;
  latestAt: string;
}

// Text summary of the charted range used by the accessible chart
// description (§10.5: minimum, maximum and latest values as text).
export function summarizeSeries(
  series: EnvironmentSeriesViewModel,
): SeriesSummary {
  return {
    temperature: summarizeMetric(series.points, "temperature"),
    humidity: summarizeMetric(series.points, "humidity"),
  };
}

function summarizeMetric(
  points: EnvironmentChartPointViewModel[],
  metric: "temperature" | "humidity",
): MetricSummary | null {
  let minimum = Infinity;
  let maximum = -Infinity;
  let latest: { value: number; at: number } | null = null;
  for (const point of points) {
    if (point.gap) {
      continue;
    }
    const detail = point[metric];
    if (detail.value === null) {
      continue;
    }
    minimum = Math.min(minimum, detail.minimum ?? detail.value);
    maximum = Math.max(maximum, detail.maximum ?? detail.value);
    if (latest === null || point.time.epochMs > latest.at) {
      latest = { value: detail.value, at: point.time.epochMs };
    }
  }
  if (latest === null) {
    return null;
  }
  return {
    minimum,
    maximum,
    latest: latest.value,
    latestAt: dateTimeFormatter.format(latest.at),
  };
}
