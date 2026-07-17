import type {
  AirconSeriesResponse,
  CurrentResponse,
  DailySummaryResponse,
  EnvironmentSeriesResponse,
  StatusResponse,
} from "./schemas";

export type SeriesResolution = "auto" | "raw" | "15m" | "1h" | "1d";

export interface RangeQuery {
  from: string;
  to: string;
}

export interface EnvironmentSeriesQuery extends RangeQuery {
  resolution?: SeriesResolution;
}

export interface ApiRequestOptions {
  signal?: AbortSignal;
}

export interface AmbientLapisApi {
  status(options?: ApiRequestOptions): Promise<StatusResponse>;
  current(options?: ApiRequestOptions): Promise<CurrentResponse>;
  environmentSeries(
    query: EnvironmentSeriesQuery,
    options?: ApiRequestOptions,
  ): Promise<EnvironmentSeriesResponse>;
  airconSeries(
    query: RangeQuery,
    options?: ApiRequestOptions,
  ): Promise<AirconSeriesResponse>;
  dailySummary(
    query: RangeQuery,
    options?: ApiRequestOptions,
  ): Promise<DailySummaryResponse>;
}
