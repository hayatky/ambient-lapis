import type { z } from "zod";

import { parseApiResponse } from "./parse";
import { rangeSearchParams, withTimeout } from "./request";
import {
  airconSeriesResponseSchema,
  currentResponseSchema,
  dailySummaryResponseSchema,
  environmentSeriesResponseSchema,
  statusResponseSchema,
} from "./schemas";
import type {
  AmbientLapisApi,
  ApiRequestOptions,
  EnvironmentSeriesQuery,
  RangeQuery,
} from "./types";

const BROWSER_TIMEOUT_MS = 10_000;

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  options?: ApiRequestOptions,
): Promise<T> {
  const response = await fetch(path, {
    headers: { Accept: "application/json" },
    signal: withTimeout(options?.signal, BROWSER_TIMEOUT_MS),
  });
  return parseApiResponse(response, schema);
}

export const browserApi: AmbientLapisApi = {
  status: (options) => request("/api/v1/status", statusResponseSchema, options),
  current: (options) =>
    request("/api/v1/current", currentResponseSchema, options),
  environmentSeries: (query: EnvironmentSeriesQuery, options) => {
    const params = rangeSearchParams(query);
    if (query.resolution !== undefined)
      params.set("resolution", query.resolution);
    return request(
      `/api/v1/environment/series?${params}`,
      environmentSeriesResponseSchema,
      options,
    );
  },
  airconSeries: (query: RangeQuery, options) =>
    request(
      `/api/v1/aircon/series?${rangeSearchParams(query)}`,
      airconSeriesResponseSchema,
      options,
    ),
  dailySummary: (query: RangeQuery, options) =>
    request(
      `/api/v1/daily-summary?${rangeSearchParams(query)}`,
      dailySummaryResponseSchema,
      options,
    ),
};
