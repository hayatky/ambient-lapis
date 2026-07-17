import "server-only";

import type { z } from "zod";

import { ApiConfigurationError } from "./errors";
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

const SERVER_TIMEOUT_MS = 8_000;

function apiBaseUrl(): URL {
  const value = process.env.REMO_API_BASE_URL;
  if (!value) throw new ApiConfigurationError();
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username !== "" ||
      url.password !== ""
    )
      throw new Error("unsupported protocol");
    return url;
  } catch (error) {
    throw new ApiConfigurationError("The internal API URL is invalid", {
      cause: error,
    });
  }
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  cache: RequestCache | { revalidate: number },
  options?: ApiRequestOptions,
): Promise<T> {
  const init: RequestInit & { next?: { revalidate: number } } = {
    headers: { Accept: "application/json" },
    signal: withTimeout(options?.signal, SERVER_TIMEOUT_MS),
  };
  if (typeof cache === "string") init.cache = cache;
  else init.next = cache;
  const response = await fetch(new URL(path, apiBaseUrl()), init);
  return parseApiResponse(response, schema);
}

export const serverApi: AmbientLapisApi = {
  status: (options) =>
    request("/api/v1/status", statusResponseSchema, "no-store", options),
  current: (options) =>
    request("/api/v1/current", currentResponseSchema, "no-store", options),
  environmentSeries: (query: EnvironmentSeriesQuery, options) => {
    const params = rangeSearchParams(query);
    if (query.resolution !== undefined)
      params.set("resolution", query.resolution);
    return request(
      `/api/v1/environment/series?${params}`,
      environmentSeriesResponseSchema,
      { revalidate: 30 },
      options,
    );
  },
  airconSeries: (query: RangeQuery, options) =>
    request(
      `/api/v1/aircon/series?${rangeSearchParams(query)}`,
      airconSeriesResponseSchema,
      { revalidate: 30 },
      options,
    ),
  dailySummary: (query: RangeQuery, options) =>
    request(
      `/api/v1/daily-summary?${rangeSearchParams(query)}`,
      dailySummaryResponseSchema,
      { revalidate: 30 },
      options,
    ),
};
