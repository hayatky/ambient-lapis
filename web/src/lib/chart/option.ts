// Pure ECharts option builder for the environment history chart.
// Layout: three stacked grids sharing one time axis — temperature panel,
// humidity panel (its own single axis each; never a dual-axis combo) and
// a slim air-conditioner state ribbon attached to the timeline. Keeping
// this free of React and DOM access makes the honesty rules (broken
// lines on gaps, no fill for unknown-as-on, no inferred settings)
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
  // Explicit shared x extent (the selected period). All three time axes
  // use it so the grids can never desync on differing data extents.
  rangeFromMs: number;
  rangeToMs: number;
  // Rendered container height; the grid layout is computed from it.
  heightPx: number;
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

type LineDataItem = [number, number | null];

function lineData(
  points: EnvironmentChartPointViewModel[],
  metric: "temperature" | "humidity",
): LineDataItem[] {
  return points.map(
    (point): LineDataItem => [
      point.time.epochMs,
      point.gap ? null : point[metric].value,
    ],
  );
}

export function targetTemperatureLineData(
  segments: AirconSegmentViewModel[],
  rangeFromMs: number,
  rangeToMs: number,
): LineDataItem[] {
  const data: LineDataItem[] = [];
  for (const segment of segments) {
    if (segment.state !== "on" || segment.targetTemperatureC === null) {
      continue;
    }
    const from = Math.max(rangeFromMs, segment.from.epochMs);
    const to = Math.min(rangeToMs, segment.to.epochMs);
    if (from >= to) {
      continue;
    }
    data.push(
      [from, segment.targetTemperatureC],
      [to, segment.targetTemperatureC],
      [to, null],
    );
  }
  return data;
}

interface PanelLayout {
  temperatureTop: number;
  temperatureHeight: number;
  humidityTop: number;
  humidityHeight: number;
  ribbonTop: number;
  ribbonHeight: number;
}

export function computePanelLayout(heightPx: number): PanelLayout {
  const top = 10;
  const gap1 = 46;
  const gap2 = 16;
  const ribbonHeight = 18;
  const axisBand = 28;
  const available = Math.max(
    120,
    heightPx - top - gap1 - gap2 - ribbonHeight - axisBand,
  );
  const temperatureHeight = Math.round(available * 0.6);
  const humidityHeight = available - temperatureHeight;
  return {
    temperatureTop: top,
    temperatureHeight,
    humidityTop: top + temperatureHeight + gap1,
    humidityHeight,
    ribbonTop: top + temperatureHeight + gap1 + humidityHeight + gap2,
    ribbonHeight,
  };
}

// Humidity axis: data-driven extent snapped to 10s so a typical indoor
// band is not crushed into 0–100.
export function humidityAxisBounds(points: EnvironmentChartPointViewModel[]): {
  min: number;
  max: number;
} {
  let low = Infinity;
  let high = -Infinity;
  for (const point of points) {
    if (point.gap) {
      continue;
    }
    const detail = point.humidity;
    if (detail.value === null) {
      continue;
    }
    low = Math.min(low, detail.minimum ?? detail.value);
    high = Math.max(high, detail.maximum ?? detail.value);
  }
  if (!Number.isFinite(low) || !Number.isFinite(high)) {
    return { min: 0, max: 100 };
  }
  let min = Math.max(0, Math.floor(low / 10) * 10);
  let max = Math.min(100, Math.ceil(high / 10) * 10);
  while (max - min < 20) {
    if (min > 0) {
      min -= 10;
    } else if (max < 100) {
      max += 10;
    } else {
      break;
    }
  }
  return { min, max };
}

const GRID_LEFT = 46;
const GRID_RIGHT = 14;

export function buildChartOption(input: ChartBuildInput): EChartsOption {
  const {
    series,
    airconSegments,
    tokens,
    pointerType,
    reducedMotion,
    rangeFromMs,
    rangeToMs,
    heightPx,
  } = input;
  const points = series.points;
  const layout = computePanelLayout(heightPx);
  const span = rangeToMs - rangeFromMs;
  const pointByTime = new Map<number, EnvironmentChartPointViewModel>();
  for (const point of points) {
    pointByTime.set(point.time.epochMs, point);
  }

  const axisLabelFormatter = (value: number): string =>
    span <= 48 * HOUR_MS
      ? timeFormatter.format(value)
      : dayFormatter.format(value);

  const hiddenTimeAxis = {
    type: "time" as const,
    min: rangeFromMs,
    max: rangeToMs,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { show: false },
    splitLine: { show: false },
    axisPointer: { show: true, label: { show: false } },
  };

  const valueAxisBase = {
    type: "value" as const,
    axisLabel: {
      color: tokens.inkMuted,
      fontSize: 10,
      margin: 10,
    },
    splitLine: {
      lineStyle: { color: tokens.hairline, width: 1 },
    },
    axisPointer: { show: false },
  };

  const humidityBounds = humidityAxisBounds(points);
  const targetTemperatureColor = withAlpha(tokens.inkMuted, 0.72);

  const temperatureSeries: SeriesOption = {
    name: "温度",
    type: "line",
    xAxisIndex: 0,
    yAxisIndex: 0,
    showSymbol: true,
    symbol: "circle",
    symbolSize: 0,
    connectNulls: false,
    lineStyle: { color: tokens.temperature, width: 2 },
    itemStyle: { color: tokens.temperature },
    areaStyle: { color: withAlpha(tokens.temperature, 0.1) },
    emphasis: { disabled: true },
    data: lineData(points, "temperature"),
    z: 3,
  };

  const humiditySeries: SeriesOption = {
    name: "湿度",
    type: "line",
    xAxisIndex: 1,
    yAxisIndex: 1,
    showSymbol: true,
    symbol: "circle",
    symbolSize: 0,
    connectNulls: false,
    lineStyle: { color: tokens.humidity, width: 2 },
    itemStyle: { color: tokens.humidity },
    areaStyle: { color: withAlpha(tokens.humidity, 0.1) },
    emphasis: { disabled: true },
    data: lineData(points, "humidity"),
    z: 3,
  };

  const targetTemperatureSeries: SeriesOption = {
    name: "Nature Remo認識設定温度",
    type: "line",
    xAxisIndex: 0,
    yAxisIndex: 0,
    showSymbol: false,
    connectNulls: false,
    step: "end",
    lineStyle: {
      color: targetTemperatureColor,
      width: 1.25,
      type: "dashed",
    },
    itemStyle: { color: targetTemperatureColor },
    emphasis: { disabled: true },
    data: targetTemperatureLineData(airconSegments, rangeFromMs, rangeToMs),
    z: 2,
  };

  // Painted ribbon segments: only states that mean something visually.
  // OFF and gap stay empty — the axis hairline is the baseline; the
  // tooltip and the key carry the words.
  const ribbonData = airconSegments
    .filter((segment) => segment.state === "on" || segment.state === "unknown")
    .map((segment) => ({
      value: [
        segment.from.epochMs,
        segment.to.epochMs,
        segment.state === "on" ? 1 : 0,
      ],
      itemStyle: {
        color: segment.state === "on" ? tokens.ribbonOn : tokens.ribbonUnknown,
      },
    }));

  const ribbonSeries: SeriesOption = {
    name: "エアコン認識",
    type: "custom",
    xAxisIndex: 2,
    yAxisIndex: 2,
    silent: true,
    renderItem: (params, api) => {
      const from = api.value(0) as number;
      const to = api.value(1) as number;
      const isOn = (api.value(2) as number) === 1;
      const start = api.coord([from, 0]);
      const end = api.coord([to, 0]);
      const height = layout.ribbonHeight;
      const x = start[0] ?? 0;
      const width = Math.max(1, (end[0] ?? 0) - x);
      const coordSys = params.coordSys as unknown as {
        x: number;
        y: number;
        width: number;
        height: number;
      };
      return {
        type: "rect",
        shape: {
          x,
          y: coordSys.y,
          width,
          height,
        },
        style: { fill: isOn ? tokens.ribbonOn : tokens.ribbonUnknown },
      };
    },
    clip: true,
    data: ribbonData,
    z: 2,
  };

  return {
    animation: !reducedMotion,
    animationDuration: 200,
    animationEasing: "quadraticOut",
    axisPointer: {
      link: [{ xAxisIndex: "all" }],
      lineStyle: { color: tokens.inkMuted, opacity: 0.45, width: 1 },
    },
    title: [
      {
        text: `{key|—} 室温 {unit|°C}  {target|┄} Nature Remo認識設定温度`,
        left: 0,
        top: 0,
        textStyle: {
          fontSize: 12,
          fontWeight: 500,
          color: tokens.inkMuted,
          rich: {
            key: { color: tokens.temperature, fontWeight: 700 },
            target: { color: targetTemperatureColor, fontWeight: 700 },
            unit: { color: tokens.inkMuted, fontSize: 11 },
          },
        },
      },
      {
        text: `{key|—} 湿度 {unit|%}`,
        left: 0,
        top: layout.humidityTop - 26,
        textStyle: {
          fontSize: 12,
          fontWeight: 500,
          color: tokens.inkMuted,
          rich: {
            key: { color: tokens.humidity, fontWeight: 700 },
            unit: { color: tokens.inkMuted, fontSize: 11 },
          },
        },
      },
      {
        text: "エアコン認識",
        left: 0,
        top: layout.ribbonTop + 1,
        textStyle: {
          fontSize: 10,
          fontWeight: 500,
          color: tokens.inkMuted,
        },
      },
    ],
    grid: [
      {
        left: GRID_LEFT,
        right: GRID_RIGHT,
        top: layout.temperatureTop + 14,
        height: layout.temperatureHeight,
        containLabel: false,
      },
      {
        left: GRID_LEFT,
        right: GRID_RIGHT,
        top: layout.humidityTop,
        height: layout.humidityHeight,
        containLabel: false,
      },
      {
        left: GRID_LEFT + 66,
        right: GRID_RIGHT,
        top: layout.ribbonTop,
        height: layout.ribbonHeight,
        containLabel: false,
      },
    ],
    xAxis: [
      { ...hiddenTimeAxis, gridIndex: 0 },
      { ...hiddenTimeAxis, gridIndex: 1 },
      {
        type: "time",
        gridIndex: 2,
        min: rangeFromMs,
        max: rangeToMs,
        axisLine: { lineStyle: { color: tokens.hairline } },
        axisTick: { show: false },
        axisLabel: {
          color: tokens.inkMuted,
          fontSize: 11,
          margin: 10,
          formatter: axisLabelFormatter,
          hideOverlap: true,
        },
        splitLine: { show: false },
        axisPointer: { show: true, label: { show: false } },
      },
    ],
    yAxis: [
      {
        ...valueAxisBase,
        gridIndex: 0,
        scale: true,
        splitNumber: 3,
        axisLabel: { ...valueAxisBase.axisLabel, showMinLabel: false },
      },
      {
        ...valueAxisBase,
        gridIndex: 1,
        min: humidityBounds.min,
        max: humidityBounds.max,
        splitNumber: 2,
      },
      {
        type: "value",
        gridIndex: 2,
        min: 0,
        max: 1,
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisPointer: { show: false },
      },
    ],
    tooltip: {
      trigger: "axis",
      triggerOn: pointerType === "fine" ? "mousemove" : "click",
      confine: true,
      backgroundColor: tokens.raised,
      borderColor: tokens.hairline,
      borderWidth: 1,
      textStyle: { color: tokens.ink, fontSize: 12 },
      extraCssText: "border-radius: 4px; padding: 10px 12px; box-shadow: none;",
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
    dataZoom: [
      {
        type: "inside",
        xAxisIndex: [0, 1, 2],
        zoomOnMouseWheel: false,
        moveOnMouseWheel: false,
        // One-finger pan would hijack vertical page scroll on phones;
        // pinch-zoom is the only gesture, presets do the rest.
        moveOnMouseMove: false,
        preventDefaultMouseMove: false,
      },
    ],
    series: [
      temperatureSeries,
      humiditySeries,
      targetTemperatureSeries,
      ribbonSeries,
    ],
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
      `<div style="color:${tokens.inkSecondary};">データなし(欠損)</div>`,
    );
  } else {
    rows.push(
      metricRow("温度", tokens.temperature, point.temperature.value, "°C", 1),
    );
    rows.push(metricRow("湿度", tokens.humidity, point.humidity.value, "%", 0));
    if (point.temperature.observedAt) {
      rows.push(
        `<div style="color:${tokens.inkSecondary};">温度計測 ${timeFormatter.format(point.temperature.observedAt.epochMs)} / 湿度計測 ${
          point.humidity.observedAt
            ? timeFormatter.format(point.humidity.observedAt.epochMs)
            : "--"
        }</div>`,
      );
    }
    rows.push(
      `<div style="color:${tokens.inkSecondary};">Remo: ${REMO_STATE_LABELS[point.remoOnlineState]}</div>`,
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
            segment.targetTemperatureC === null ? " / 設定 --" : ""
          }`
        : SEGMENT_STATE_LABELS[segment.state];
    rows.push(
      `<div style="color:${tokens.inkSecondary};">エアコン認識: ${detail}</div>`,
    );
    if (segment.state === "on" && segment.targetTemperatureC !== null) {
      rows.push(
        metricRow(
          "認識設定温度",
          withAlpha(tokens.inkMuted, 0.72),
          segment.targetTemperatureC,
          "°C",
          1,
        ),
      );
      const roomTemperature =
        !point || point.gap ? null : point.temperature.value;
      if (point && roomTemperature !== null) {
        const delta = roomTemperature - segment.targetTemperatureC;
        const deltaLabel =
          delta >= 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1);
        const roomLabel =
          point.temperature.sampleCount === null ? "室温" : "平均室温";
        rows.push(
          `<div style="color:${tokens.inkSecondary};">${roomLabel}−設定 ${deltaLabel}°C</div>`,
        );
      }
    }
  }
  return rows.join("");
}

function metricRow(
  label: string,
  color: string,
  value: number | null,
  unit: string,
  digits: number,
): string {
  const display = value === null ? "--" : value.toFixed(digits);
  return `<div style="display:flex;align-items:center;gap:6px;"><span style="display:inline-block;width:10px;height:3px;border-radius:2px;background:${color};"></span>${label} <span style="font-weight:600;">${display}${unit}</span></div>`;
}

export interface SeriesSummary {
  temperature: MetricSummary | null;
  humidity: MetricSummary | null;
  targetTemperature: TargetTemperatureSummary | null;
}

export interface MetricSummary {
  minimum: number;
  maximum: number;
  latest: number;
  latestAt: string;
}

export interface TargetTemperatureSummary {
  latest: number;
  latestAt: string;
  roomDelta: number | null;
  roomValueKind: "室温" | "平均室温";
}

// Text summary of the charted range used by the accessible chart
// description (minimum, maximum and latest values as text).
export function summarizeSeries(
  series: EnvironmentSeriesViewModel,
  airconSegments: AirconSegmentViewModel[] = [],
): SeriesSummary {
  return {
    temperature: summarizeMetric(series.points, "temperature"),
    humidity: summarizeMetric(series.points, "humidity"),
    targetTemperature: summarizeTargetTemperature(
      series.points,
      airconSegments,
    ),
  };
}

function summarizeTargetTemperature(
  points: EnvironmentChartPointViewModel[],
  segments: AirconSegmentViewModel[],
): TargetTemperatureSummary | null {
  const segment = [...segments]
    .filter(
      (candidate) =>
        candidate.state === "on" && candidate.targetTemperatureC !== null,
    )
    .sort((left, right) => right.to.epochMs - left.to.epochMs)[0];
  if (!segment || segment.targetTemperatureC === null) {
    return null;
  }
  const roomPoint = points
    .filter(
      (point) =>
        !point.gap &&
        point.temperature.value !== null &&
        segment.from.epochMs <= point.time.epochMs &&
        point.time.epochMs < segment.to.epochMs,
    )
    .sort((left, right) => right.time.epochMs - left.time.epochMs)[0];
  return {
    latest: segment.targetTemperatureC,
    latestAt: dateTimeFormatter.format(segment.from.epochMs),
    roomDelta:
      roomPoint?.temperature.value === null || roomPoint === undefined
        ? null
        : Math.round(
            (roomPoint.temperature.value - segment.targetTemperatureC) * 10,
          ) / 10,
    roomValueKind:
      roomPoint?.temperature.sampleCount === null ? "室温" : "平均室温",
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
