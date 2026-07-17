export type WarningCode =
  | "collectionStopped"
  | "remoOffline"
  | "partialFailure"
  | "temperatureStale"
  | "humidityStale"
  | "airconUnknown";

export interface DashboardWarning {
  code: WarningCode;
  severity: "danger" | "warning";
  title: string;
  detail: string;
}

export interface DisplayTimestamp {
  iso: string;
  epochMs: number;
  label: string;
  ageSeconds: number;
}

export interface CurrentMetricViewModel {
  value: number | null;
  displayValue: string;
  unit: "°C" | "%";
  observedAt: DisplayTimestamp | null;
  stale: boolean;
}

export interface CurrentEnvironmentViewModel {
  fetchedAt: DisplayTimestamp;
  remoOnline: boolean | null;
  temperature: CurrentMetricViewModel;
  humidity: CurrentMetricViewModel;
}

export interface AirconViewModel {
  heading: "エアコン - Nature Remo認識状態";
  recognitionState: "on" | "off" | "unknown";
  recognitionLabel: "運転中" | "停止" | "不明";
  mode: { raw: string; label: string; known: boolean };
  targetTemperatureC: number | null;
  targetTemperatureLabel: string;
  volume: string | null;
  directionVertical: string | null;
  directionHorizontal: string | null;
  fetchedAt: DisplayTimestamp;
  settingsUpdatedAt: DisplayTimestamp | null;
  disclaimer: "エアコン本体との双方向確認ではありません";
}

export interface ChartMetricViewModel {
  value: number | null;
  minimum: number | null;
  maximum: number | null;
  observedAt: DisplayTimestamp | null;
  sampleCount: number | null;
}

export interface EnvironmentChartPointViewModel {
  time: DisplayTimestamp;
  temperature: ChartMetricViewModel;
  humidity: ChartMetricViewModel;
  remoOnlineState: "online" | "offline" | "mixed" | "unknown";
  gap: boolean;
  stale: boolean;
}

export interface EnvironmentSeriesViewModel {
  resolution: "raw" | "15m" | "1h" | "1d";
  points: EnvironmentChartPointViewModel[];
}

export interface AirconSegmentViewModel {
  from: DisplayTimestamp;
  to: DisplayTimestamp;
  state: "on" | "off" | "unknown" | "gap";
  mode: string | null;
  targetTemperatureC: number | null;
}

export interface DailyMetricViewModel {
  average: number | null;
  minimum: number | null;
  maximum: number | null;
  sampleCount: number;
}

export interface DailySummaryViewModel {
  date: string;
  dateLabel: string;
  temperature: DailyMetricViewModel | null;
  humidity: DailyMetricViewModel | null;
  gapMinutes: number;
}

export interface DashboardViewModel {
  collectionState: "initializing" | "healthy" | "degraded" | "stopped";
  warnings: DashboardWarning[];
  lastFullSuccessAt: DisplayTimestamp | null;
  environment: CurrentEnvironmentViewModel | null;
  aircon: AirconViewModel | null;
  environmentSeries: EnvironmentSeriesViewModel | null;
  airconSegments: AirconSegmentViewModel[];
  dailySummary: DailySummaryViewModel[];
}
