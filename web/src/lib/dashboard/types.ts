import type {
  AirconSeriesResponse,
  CurrentResponse,
  DailySummaryResponse,
  EnvironmentSeriesResponse,
  RangeQuery,
  StatusResponse,
} from "../api";

export type ResourceStatus = "loading" | "ready" | "refreshing" | "error";

export type UiErrorCode =
  | "aborted"
  | "configuration"
  | "contract"
  | "invalidRequest"
  | "notReady"
  | "timeout"
  | "unavailable"
  | "unknown";

/**
 * A deliberately small error shape safe to serialize into the page and render.
 * It never contains an upstream response body, URL, stack, or configuration value.
 */
export interface UiError {
  code: UiErrorCode;
  title: string;
  detail: string;
  retryable: boolean;
}

/**
 * `data` is retained when a refresh fails so that the dashboard never discards
 * the last successfully parsed values. Consumers must still render `error`.
 */
export interface ResourceState<T> {
  status: ResourceStatus;
  data: T | null;
  error: UiError | null;
}

export interface DashboardResources {
  status: ResourceState<StatusResponse>;
  current: ResourceState<CurrentResponse>;
  environmentSeries: ResourceState<EnvironmentSeriesResponse>;
  airconSeries: ResourceState<AirconSeriesResponse>;
  dailySummary: ResourceState<DailySummaryResponse>;
}

export type HistoryPreset = "24h" | "7d" | "30d" | "custom";

export interface HistoryRange extends RangeQuery {
  preset: HistoryPreset;
  fromDate?: string;
  toDate?: string;
}

export interface CustomHistoryInput {
  fromDate: string;
  toDate: string;
}

export type RangeValidationErrorCode =
  | "invalidDate"
  | "futureDate"
  | "reversedRange"
  | "rangeTooLarge";

export interface RangeValidationError {
  code: RangeValidationErrorCode;
  field: "fromDate" | "toDate";
  message: string;
}

export type RangeValidationResult =
  | { ok: true; value: HistoryRange }
  | { ok: false; error: RangeValidationError };

export interface DashboardInitialData {
  loadedAt: string;
  historyRange: HistoryRange;
  dailyRange: RangeQuery;
  resources: DashboardResources;
}

export type DashboardResourceKey = keyof DashboardResources;
