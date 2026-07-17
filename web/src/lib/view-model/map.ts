import type {
  AirconSeriesData,
  CurrentData,
  DailySummaryData,
  EnvironmentSeriesData,
  StatusData,
} from "../api/schemas";
import { formatDate, toDisplayTimestamp } from "./time";
import type {
  AirconSegmentViewModel,
  AirconViewModel,
  ChartMetricViewModel,
  CurrentEnvironmentViewModel,
  DailySummaryViewModel,
  DashboardViewModel,
  DashboardWarning,
  EnvironmentSeriesViewModel,
} from "./types";

const MISSING_VALUE = "--";

export interface DashboardSources {
  status: StatusData;
  current: CurrentData;
  environmentSeries?: EnvironmentSeriesData | null;
  airconSeries?: AirconSeriesData | null;
  dailySummary?: DailySummaryData | null;
}

export function mapDashboard(
  sources: DashboardSources,
  now: Date,
): DashboardViewModel {
  return {
    collectionState: sources.status.collectionState,
    warnings: mapWarnings(sources.status, sources.current),
    lastFullSuccessAt: sources.status.lastFullSuccessAt
      ? toDisplayTimestamp(sources.status.lastFullSuccessAt, now)
      : null,
    environment: mapCurrentEnvironment(sources.current, now),
    aircon: mapAircon(sources.current, now),
    environmentSeries: sources.environmentSeries
      ? mapEnvironmentSeries(sources.environmentSeries, now)
      : null,
    airconSegments: mapAirconSegments(sources.airconSeries, now),
    dailySummary: mapDailySummary(sources.dailySummary),
  };
}

export function mapWarnings(
  status: StatusData,
  current: CurrentData,
): DashboardWarning[] {
  const warnings: DashboardWarning[] = [];
  if (
    status.collectionState === "stopped" ||
    (status.collectionState !== "initializing" &&
      current.freshness.collectionStopped)
  ) {
    warnings.push({
      code: "collectionStopped",
      severity: "danger",
      title: "データ収集が停止しています",
      detail:
        "最後に取得した値を表示しています。最終完全成功時刻を確認してください。",
    });
  }
  if (current.environment?.remoOnline === false) {
    warnings.push({
      code: "remoOffline",
      severity: "danger",
      title: "Nature Remoがオフラインです",
      detail: "表示値は現在値ではない可能性があります。",
    });
  }
  const lastRun = status.lastRun;
  const endpointPartial =
    lastRun !== null &&
    ((lastRun.devicesStatus === "success" &&
      lastRun.appliancesStatus === "error") ||
      (lastRun.devicesStatus === "error" &&
        lastRun.appliancesStatus === "success"));
  if (lastRun?.overallStatus === "partial" || endpointPartial) {
    warnings.push({
      code: "partialFailure",
      severity: "warning",
      title: "一部のデータを取得できませんでした",
      detail: "取得できた領域はそのまま表示しています。",
    });
  }
  if (current.environment?.temperature.stale === true) {
    warnings.push({
      code: "temperatureStale",
      severity: "warning",
      title: "温度の計測値が更新されていません",
      detail: "最後に観測できた温度を表示しています。",
    });
  }
  if (current.environment?.humidity.stale === true) {
    warnings.push({
      code: "humidityStale",
      severity: "warning",
      title: "湿度の計測値が更新されていません",
      detail: "最後に観測できた湿度を表示しています。",
    });
  }
  if (current.aircon?.recognitionState === "unknown") {
    warnings.push({
      code: "airconUnknown",
      severity: "warning",
      title: "エアコンの認識状態が不明です",
      detail: "ONまたはOFFを推測せず、不明として表示します。",
    });
  }
  return warnings;
}

export function mapCurrentEnvironment(
  current: CurrentData,
  now: Date,
): CurrentEnvironmentViewModel | null {
  const environment = current.environment;
  if (!environment) return null;
  return {
    fetchedAt: toDisplayTimestamp(environment.fetchedAt, now),
    remoOnline: environment.remoOnline,
    temperature: {
      value: environment.temperature.valueC,
      displayValue:
        environment.temperature.valueC === null
          ? MISSING_VALUE
          : environment.temperature.valueC.toFixed(1),
      unit: "°C",
      observedAt: environment.temperature.observedAt
        ? toDisplayTimestamp(environment.temperature.observedAt, now)
        : null,
      stale: environment.temperature.stale,
    },
    humidity: {
      value: environment.humidity.valuePct,
      displayValue:
        environment.humidity.valuePct === null
          ? MISSING_VALUE
          : environment.humidity.valuePct.toFixed(0),
      unit: "%",
      observedAt: environment.humidity.observedAt
        ? toDisplayTimestamp(environment.humidity.observedAt, now)
        : null,
      stale: environment.humidity.stale,
    },
  };
}

export function mapAircon(
  current: CurrentData,
  now: Date,
): AirconViewModel | null {
  const aircon = current.aircon;
  if (!aircon) return null;
  const labels = { on: "運転中", off: "停止", unknown: "不明" } as const;
  return {
    heading: "エアコン - Nature Remo認識状態",
    recognitionState: aircon.recognitionState,
    recognitionLabel: labels[aircon.recognitionState],
    mode: aircon.mode,
    targetTemperatureC: aircon.targetTemperatureC,
    targetTemperatureLabel:
      aircon.targetTemperatureC === null
        ? MISSING_VALUE
        : `${aircon.targetTemperatureC.toFixed(1)} °C`,
    volume: aircon.volume,
    directionVertical: aircon.directionVertical,
    directionHorizontal: aircon.directionHorizontal,
    fetchedAt: toDisplayTimestamp(aircon.fetchedAt, now),
    settingsUpdatedAt: aircon.settingsUpdatedAt
      ? toDisplayTimestamp(aircon.settingsUpdatedAt, now)
      : null,
    disclaimer: "エアコン本体との双方向確認ではありません",
  };
}

export function mapEnvironmentSeries(
  series: EnvironmentSeriesData,
  now: Date,
): EnvironmentSeriesViewModel {
  if (series.resolution === "raw") {
    return {
      resolution: series.resolution,
      points: series.points.map((point) => ({
        time: toDisplayTimestamp(point.time, now),
        temperature: rawChartMetric(
          point.temperature.value,
          point.temperature.observedAt,
          now,
        ),
        humidity: rawChartMetric(
          point.humidity.value,
          point.humidity.observedAt,
          now,
        ),
        remoOnlineState: point.remoOnlineState,
        gap: point.gap,
        stale: point.stale,
      })),
    };
  }
  return {
    resolution: series.resolution,
    points: series.points.map((point) => ({
      time: toDisplayTimestamp(point.time, now),
      temperature: {
        value: point.temperature.avg,
        minimum: point.temperature.min,
        maximum: point.temperature.max,
        observedAt: point.temperature.latestObservedAt
          ? toDisplayTimestamp(point.temperature.latestObservedAt, now)
          : null,
        sampleCount: point.temperature.sampleCount,
      },
      humidity: {
        value: point.humidity.avg,
        minimum: point.humidity.min,
        maximum: point.humidity.max,
        observedAt: point.humidity.latestObservedAt
          ? toDisplayTimestamp(point.humidity.latestObservedAt, now)
          : null,
        sampleCount: point.humidity.sampleCount,
      },
      remoOnlineState: point.remoOnlineState,
      gap: point.gap,
      stale: point.stale,
    })),
  };
}

function rawChartMetric(
  value: number | null,
  observedAt: string | null,
  now: Date,
): ChartMetricViewModel {
  return {
    value,
    minimum: null,
    maximum: null,
    observedAt: observedAt ? toDisplayTimestamp(observedAt, now) : null,
    sampleCount: null,
  };
}

export function mapAirconSegments(
  series: AirconSeriesData | null | undefined,
  now: Date,
): AirconSegmentViewModel[] {
  return (series?.segments ?? []).map((segment) => ({
    from: toDisplayTimestamp(segment.from, now),
    to: toDisplayTimestamp(segment.to, now),
    state: segment.state,
    mode: segment.mode,
    targetTemperatureC: segment.targetTemperatureC,
  }));
}

export function mapDailySummary(
  series: DailySummaryData | null | undefined,
): DailySummaryViewModel[] {
  return [...(series?.days ?? [])]
    .sort((left, right) => right.date.localeCompare(left.date))
    .map((day) => ({
      date: day.date,
      dateLabel: formatDate(day.date),
      temperature: day.temperature
        ? {
            average: day.temperature.avg,
            minimum: day.temperature.min,
            maximum: day.temperature.max,
            sampleCount: day.temperature.sampleCount,
          }
        : null,
      humidity: day.humidity
        ? {
            average: day.humidity.avg,
            minimum: day.humidity.min,
            maximum: day.humidity.max,
            sampleCount: day.humidity.sampleCount,
          }
        : null,
      gapMinutes: day.gapMinutes,
    }));
}
