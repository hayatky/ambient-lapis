import type { LineSeriesOption } from "echarts/charts";
import type { ComposeOption } from "echarts/core";
import type {
  DataZoomComponentOption,
  GridComponentOption,
  TooltipComponentOption,
} from "echarts/components";

import type {
  AirconSegmentViewModel,
  EnvironmentChartPointViewModel,
  EnvironmentSeriesViewModel,
} from "@/lib/view-model";

import type { ChartPalette } from "./types";

export type HistoryChartOption = ComposeOption<
  | LineSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | DataZoomComponentOption
>;

export interface BuildHistoryChartOptionInput {
  series: EnvironmentSeriesViewModel;
  airconSegments: AirconSegmentViewModel[];
  palette: ChartPalette;
  reducedMotion: boolean;
  showSlider: boolean;
}

type MetricName = "temperature" | "humidity";
type MarkAreaRange = [{ xAxis: number }, { xAxis: number }];

const axisDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function buildHistoryChartOption({
  series,
  airconSegments,
  palette,
  reducedMotion,
  showSlider,
}: BuildHistoryChartOptionInput): HistoryChartOption {
  const dataZoom: DataZoomComponentOption[] = [
    {
      type: "inside",
      xAxisIndex: 0,
      filterMode: "none",
      zoomOnMouseWheel: false,
      moveOnMouseWheel: false,
      moveOnMouseMove: true,
      preventDefaultMouseMove: true,
    },
  ];

  if (showSlider) {
    dataZoom.push({
      type: "slider",
      xAxisIndex: 0,
      filterMode: "none",
      height: 18,
      bottom: 4,
      showDetail: false,
      brushSelect: false,
      borderColor: palette.border,
      backgroundColor: "transparent",
      fillerColor: toRgba(palette.airconOn, 0.12),
      handleStyle: {
        color: palette.surface,
        borderColor: palette.mutedText,
      },
      moveHandleStyle: { color: palette.mutedText },
      dataBackground: {
        lineStyle: { color: palette.mutedText, opacity: 0.35 },
        areaStyle: { color: palette.mutedText, opacity: 0.08 },
      },
      selectedDataBackground: {
        lineStyle: { color: palette.airconOn, opacity: 0.65 },
        areaStyle: { color: palette.airconOn, opacity: 0.12 },
      },
    });
  }

  const temperatureData = buildMetricData(
    series.points,
    "temperature",
    palette.temperature,
    palette.surface,
  );
  const humidityData = buildMetricData(
    series.points,
    "humidity",
    palette.humidity,
    palette.surface,
  );
  const onAreas: MarkAreaRange[] = airconSegments
    .filter((segment) => segment.state === "on")
    .map((segment) => [
      { xAxis: segment.from.epochMs },
      { xAxis: segment.to.epochMs },
    ]);

  return {
    animation: !reducedMotion,
    animationDuration: reducedMotion ? 0 : 180,
    animationDurationUpdate: reducedMotion ? 0 : 180,
    textStyle: {
      color: palette.text,
      fontFamily:
        'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    grid: {
      left: 12,
      right: 12,
      top: 24,
      bottom: showSlider ? 58 : 28,
      containLabel: true,
    },
    tooltip: {
      trigger: "axis",
      triggerOn: "mousemove|click|mousewheel",
      renderMode: "richText",
      confine: true,
      transitionDuration: reducedMotion ? 0 : 0.12,
      axisPointer: {
        type: "line",
        snap: true,
        lineStyle: { color: palette.mutedText, width: 1, type: "dashed" },
      },
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderWidth: 1,
      textStyle: { color: palette.text, lineHeight: 19 },
      formatter: (params: unknown) =>
        formatHistoryTooltip(
          extractTooltipEpoch(params),
          series,
          airconSegments,
        ),
    },
    xAxis: {
      type: "time",
      boundaryGap: [0, 0],
      axisLine: { lineStyle: { color: palette.border } },
      axisTick: { show: false },
      axisLabel: {
        color: palette.mutedText,
        hideOverlap: true,
        formatter: formatJstAxisLabel,
      },
      splitLine: { show: false },
    },
    yAxis: [
      {
        type: "value",
        name: "温度 °C",
        nameLocation: "end",
        nameTextStyle: { color: palette.temperature, align: "left" },
        position: "left",
        scale: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: palette.mutedText,
          formatter: (value: number) => `${formatNumber(value, 1)}°`,
        },
        splitLine: {
          lineStyle: { color: palette.border, width: 1, type: "dashed" },
        },
      },
      {
        type: "value",
        name: "湿度 %",
        nameLocation: "end",
        nameTextStyle: { color: palette.humidity, align: "right" },
        position: "right",
        min: 0,
        max: 100,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: palette.mutedText,
          formatter: (value: number) => `${formatNumber(value, 0)}%`,
        },
        splitLine: { show: false },
      },
    ],
    dataZoom,
    series: [
      {
        id: "temperature",
        name: "温度",
        type: "line",
        yAxisIndex: 0,
        data: temperatureData,
        connectNulls: false,
        showSymbol: true,
        symbol: "none",
        smooth: false,
        lineStyle: { color: palette.temperature, width: 2.25 },
        itemStyle: { color: palette.temperature },
        emphasis: { disabled: true },
        markArea: {
          silent: true,
          label: { show: false },
          tooltip: { show: false },
          itemStyle: { color: toRgba(palette.airconOn, 0.1) },
          data: onAreas,
        },
      },
      {
        id: "humidity",
        name: "湿度",
        type: "line",
        yAxisIndex: 1,
        data: humidityData,
        connectNulls: false,
        showSymbol: true,
        symbol: "none",
        smooth: false,
        lineStyle: { color: palette.humidity, width: 1.9 },
        itemStyle: { color: palette.humidity },
        emphasis: { disabled: true },
      },
    ],
  };
}

function buildMetricData(
  points: EnvironmentChartPointViewModel[],
  metricName: MetricName,
  seriesColor: string,
  surfaceColor: string,
): NonNullable<LineSeriesOption["data"]> {
  return points.map((point) => {
    const value = point.gap ? null : point[metricName].value;
    const stale = point.stale && value !== null;
    return {
      value: [point.time.epochMs, value],
      symbol: stale ? "circle" : "none",
      symbolSize: stale ? 8 : 0,
      itemStyle: stale
        ? {
            color: surfaceColor,
            borderColor: seriesColor,
            borderWidth: 2,
          }
        : { color: seriesColor },
    };
  });
}

export function formatHistoryTooltip(
  epochMs: number | null,
  series: EnvironmentSeriesViewModel,
  airconSegments: AirconSegmentViewModel[],
): string {
  if (epochMs === null) return "詳細を表示できません";

  const point = series.points.find((item) => item.time.epochMs === epochMs);
  if (!point) return formatJstDateTime(epochMs);

  const temperature = point.gap ? null : point.temperature.value;
  const humidity = point.gap ? null : point.humidity.value;
  const airconState = airconSegments.find(
    (segment) =>
      epochMs >= segment.from.epochMs && epochMs < segment.to.epochMs,
  )?.state;

  return [
    point.time.label,
    `温度 ${formatMetric(temperature, "°C", 1)}`,
    `温度の計測 ${point.temperature.observedAt?.label ?? "--"}`,
    `湿度 ${formatMetric(humidity, "%", 1)}`,
    `湿度の計測 ${point.humidity.observedAt?.label ?? "--"}`,
    `Remo ${remoStateLabel(point.remoOnlineState)}`,
    `エアコン認識 ${airconStateLabel(airconState)}`,
  ].join("\n");
}

export function extractTooltipEpoch(params: unknown): number | null {
  const first = Array.isArray(params) ? params[0] : params;
  if (!isRecord(first)) return null;

  if (typeof first.axisValue === "number" && Number.isFinite(first.axisValue)) {
    return first.axisValue;
  }
  if (typeof first.axisValue === "string") {
    const numeric = Number(first.axisValue);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(first.axisValue);
    if (Number.isFinite(parsed)) return parsed;
  }

  const value = first.value;
  if (
    Array.isArray(value) &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0])
  ) {
    return value[0];
  }
  return null;
}

export function toRgba(color: string, alpha: number): string {
  const hex = color.trim().match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (hex) {
    const red = Number.parseInt(hex[1] ?? "00", 16);
    const green = Number.parseInt(hex[2] ?? "00", 16);
    const blue = Number.parseInt(hex[3] ?? "00", 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }
  return color;
}

function formatJstAxisLabel(value: string | number): string {
  const epochMs = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(epochMs) ? axisDateFormatter.format(epochMs) : "";
}

function formatJstDateTime(epochMs: number): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(epochMs);
}

function formatMetric(
  value: number | null,
  unit: "°C" | "%",
  fractionDigits: number,
): string {
  return value === null
    ? "--"
    : `${formatNumber(value, fractionDigits)} ${unit}`;
}

function formatNumber(value: number, maximumFractionDigits: number): string {
  return new Intl.NumberFormat("ja-JP", {
    maximumFractionDigits,
  }).format(value);
}

function remoStateLabel(
  state: EnvironmentChartPointViewModel["remoOnlineState"],
): string {
  switch (state) {
    case "online":
      return "オンライン";
    case "offline":
      return "オフライン";
    case "mixed":
      return "一部オフライン";
    case "unknown":
      return "状態不明";
  }
}

function airconStateLabel(
  state: AirconSegmentViewModel["state"] | undefined,
): string {
  switch (state) {
    case "on":
      return "運転中";
    case "off":
      return "停止";
    case "unknown":
      return "不明";
    case "gap":
      return "データ欠損";
    default:
      return "--";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
