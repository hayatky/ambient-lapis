// Scenario-driven response builders for the mock Go API. Pure functions
// (explicit nowMs / requestId) so contract tests stay deterministic.
// All identifiers and values are fictional; the payload shapes must stay
// in lockstep with the Go API contract (validated by mock-api.test.ts).

import {
  generateAggregatePoints,
  generateAirconSegments,
  generateDailySummary,
  generateRawPoints,
  humidityAt,
  selectResolution,
  temperatureAt,
} from "./generate.ts";

const MINUTE_MS = 60_000;

export const scenarioNames = [
  "normal",
  "initializing",
  "noData",
  "partialEnvironmentOnly",
  "partialAirconOnly",
  "collectionStopped",
  "remoOffline",
  "temperatureStale",
  "humidityStale",
  "airconUnknown",
  "unknownAirconMode",
  "fullError",
  "historyError",
] as const;

export type ScenarioName = (typeof scenarioNames)[number];

export function isScenarioName(value: string): value is ScenarioName {
  return (scenarioNames as readonly string[]).includes(value);
}

export interface MockResponse {
  status: number;
  body: unknown;
}

interface BuildContext {
  scenario: ScenarioName;
  nowMs: number;
  requestId: string;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function meta(context: BuildContext): {
  requestId: string;
  generatedAt: string;
  timezone: string;
} {
  return {
    requestId: context.requestId,
    generatedAt: iso(context.nowMs),
    timezone: "Asia/Tokyo",
  };
}

function errorResponse(
  context: BuildContext,
  status: number,
  code: string,
  message: string,
  field?: string,
): MockResponse {
  return {
    status,
    body: {
      error: field ? { code, message, field } : { code, message },
      meta: {
        requestId: context.requestId,
        generatedAt: iso(context.nowMs),
      },
    },
  };
}

function upstreamError(context: BuildContext): MockResponse {
  return errorResponse(
    context,
    503,
    "upstream_error",
    "mock scenario simulates an upstream failure",
  );
}

// How far back the last successful collection lies, per scenario.
function lastSuccessMs(context: BuildContext): number | null {
  switch (context.scenario) {
    case "initializing":
      return null;
    case "collectionStopped":
      return context.nowMs - 35 * MINUTE_MS;
    default:
      return context.nowMs - 2 * MINUTE_MS;
  }
}

function dataEndMs(context: BuildContext): number {
  return lastSuccessMs(context) ?? context.nowMs - 365 * 24 * 60 * MINUTE_MS;
}

export function buildStatus(context: BuildContext): MockResponse {
  const { scenario, nowMs } = context;
  const successAt = lastSuccessMs(context);
  const collectionState =
    scenario === "initializing"
      ? "initializing"
      : scenario === "collectionStopped"
        ? "stopped"
        : scenario === "partialEnvironmentOnly" ||
            scenario === "partialAirconOnly" ||
            scenario === "fullError"
          ? "degraded"
          : "healthy";
  const lastRun =
    scenario === "initializing"
      ? null
      : {
          startedAt: iso((successAt ?? nowMs) - 1_200),
          completedAt: iso(successAt ?? nowMs),
          overallStatus:
            scenario === "partialEnvironmentOnly" ||
            scenario === "partialAirconOnly"
              ? "partial"
              : scenario === "fullError"
                ? "error"
                : "success",
          devicesStatus:
            scenario === "partialAirconOnly" || scenario === "fullError"
              ? "error"
              : "success",
          appliancesStatus:
            scenario === "partialEnvironmentOnly" || scenario === "fullError"
              ? "error"
              : "success",
          errorCodes:
            scenario === "fullError"
              ? ["timeout", "upstream_error"]
              : scenario === "partialEnvironmentOnly"
                ? ["upstream_error"]
                : scenario === "partialAirconOnly"
                  ? ["timeout"]
                  : [],
        };
  return {
    status: 200,
    body: {
      data: {
        collectionState,
        lastFullSuccessAt: successAt === null ? null : iso(successAt),
        lastEnvironmentSuccessAt:
          successAt === null || scenario === "partialAirconOnly"
            ? successAt === null
              ? null
              : iso(successAt - 10 * MINUTE_MS)
            : iso(successAt),
        lastAirconSuccessAt:
          successAt === null || scenario === "partialEnvironmentOnly"
            ? successAt === null
              ? null
              : iso(successAt - 10 * MINUTE_MS)
            : iso(successAt),
        lastRun,
        pollIntervalSeconds: 300,
        staleAfterSeconds: 600,
      },
      meta: meta(context),
    },
  };
}

export function buildCurrent(context: BuildContext): MockResponse {
  const { scenario, nowMs } = context;
  const successAt = lastSuccessMs(context);
  const fetchedAt = successAt ?? nowMs;
  const noSamples = scenario === "initializing" || scenario === "noData";

  const temperatureStale =
    scenario === "temperatureStale" || scenario === "collectionStopped";
  const humidityStale =
    scenario === "humidityStale" || scenario === "collectionStopped";
  const environment =
    noSamples || scenario === "partialAirconOnly"
      ? null
      : {
          fetchedAt: iso(fetchedAt),
          remoOnline: scenario === "remoOffline" ? false : true,
          temperature: {
            valueC: round1(temperatureAt(fetchedAt)),
            observedAt: iso(
              fetchedAt - (temperatureStale ? 22 * MINUTE_MS : 80_000),
            ),
            stale: temperatureStale,
          },
          humidity: {
            valuePct: round1(humidityAt(fetchedAt)),
            observedAt: iso(
              fetchedAt - (humidityStale ? 22 * MINUTE_MS : 70_000),
            ),
            stale: humidityStale,
          },
        };

  const aircon =
    noSamples || scenario === "partialEnvironmentOnly"
      ? null
      : scenario === "airconUnknown"
        ? {
            fetchedAt: iso(fetchedAt),
            recognitionState: "unknown",
            mode: { raw: "", label: "", known: false },
            targetTemperatureC: null,
            volume: null,
            directionVertical: null,
            directionHorizontal: null,
            settingsUpdatedAt: iso(fetchedAt - 90 * MINUTE_MS),
          }
        : scenario === "unknownAirconMode"
          ? {
              fetchedAt: iso(fetchedAt),
              recognitionState: "on",
              mode: {
                raw: "vendor-eco-plus",
                label: "vendor-eco-plus",
                known: false,
              },
              targetTemperatureC: 26,
              volume: "3",
              directionVertical: "swing",
              directionHorizontal: null,
              settingsUpdatedAt: iso(fetchedAt - 40 * MINUTE_MS),
            }
          : {
              fetchedAt: iso(fetchedAt),
              recognitionState: "on",
              mode: { raw: "cool", label: "冷房", known: true },
              targetTemperatureC: 26,
              volume: "auto",
              directionVertical: "auto",
              directionHorizontal: null,
              settingsUpdatedAt: iso(fetchedAt - 40 * MINUTE_MS),
            };

  return {
    status: 200,
    body: {
      data: {
        environment,
        aircon,
        freshness: {
          collectionStopped:
            scenario === "collectionStopped" || scenario === "initializing",
          lastFullSuccessAt: successAt === null ? null : iso(successAt),
        },
      },
      meta: meta(context),
    },
  };
}

export function buildEnvironmentSeries(
  context: BuildContext,
  query: { fromMs: number; toMs: number; resolution: string },
): MockResponse {
  if (context.scenario === "fullError" || context.scenario === "historyError") {
    return upstreamError(context);
  }
  const selected = selectResolution(
    query.resolution,
    query.toMs - query.fromMs,
  );
  if ("error" in selected) {
    return errorResponse(
      context,
      422,
      "range_too_large",
      "range exceeds the selected resolution limit",
      "to",
    );
  }
  const noSamples =
    context.scenario === "initializing" || context.scenario === "noData";
  const options = {
    fromMs: query.fromMs,
    toMs: query.toMs,
    dataEndMs: noSamples ? query.fromMs - 1 : dataEndMs(context),
    offlineAfterMs:
      context.scenario === "remoOffline"
        ? context.nowMs - 30 * MINUTE_MS
        : undefined,
  };
  const points =
    selected.resolution === "raw"
      ? generateRawPoints(options)
      : generateAggregatePoints({
          ...options,
          resolution: selected.resolution,
        });
  return {
    status: 200,
    body: {
      data: { resolution: selected.resolution, points },
      meta: {
        ...meta(context),
        from: iso(query.fromMs),
        to: iso(query.toMs),
        limit: 10_000,
        truncated: false,
      },
    },
  };
}

export function buildAirconSeries(
  context: BuildContext,
  query: { fromMs: number; toMs: number },
): MockResponse {
  if (context.scenario === "fullError" || context.scenario === "historyError") {
    return upstreamError(context);
  }
  const noSamples =
    context.scenario === "initializing" || context.scenario === "noData";
  const segments = noSamples
    ? []
    : generateAirconSegments({
        fromMs: query.fromMs,
        toMs: query.toMs,
        dataEndMs: dataEndMs(context),
        unknownAfterMs:
          context.scenario === "airconUnknown"
            ? context.nowMs - 90 * MINUTE_MS
            : undefined,
      });
  return {
    status: 200,
    body: {
      data: { segments },
      meta: { ...meta(context), limit: 10_000, truncated: false },
    },
  };
}

export function buildDailySummary(
  context: BuildContext,
  query: { fromMs: number; toMs: number },
): MockResponse {
  if (context.scenario === "fullError" || context.scenario === "historyError") {
    return upstreamError(context);
  }
  const noSamples =
    context.scenario === "initializing" || context.scenario === "noData";
  const days = noSamples
    ? []
    : generateDailySummary({
        fromMs: query.fromMs,
        toMs: query.toMs,
        dataEndMs: dataEndMs(context),
      });
  return {
    status: 200,
    body: {
      data: { days },
      meta: { ...meta(context), limit: 10_000, truncated: false },
    },
  };
}

export function buildResponse(
  scenario: ScenarioName,
  endpoint: string,
  searchParams: URLSearchParams,
  nowMs: number,
  requestId: string,
): MockResponse | null {
  const context: BuildContext = { scenario, nowMs, requestId };
  if (endpoint === "/api/v1/status") {
    if (scenario === "fullError") {
      return upstreamError(context);
    }
    return buildStatus(context);
  }
  if (endpoint === "/api/v1/current") {
    if (scenario === "fullError") {
      return upstreamError(context);
    }
    return buildCurrent(context);
  }
  const range = parseRange(context, searchParams);
  if (range === null) {
    return errorResponse(
      context,
      400,
      "invalid_parameter",
      "from and to are required RFC 3339 timestamps",
      "from",
    );
  }
  if (endpoint === "/api/v1/environment/series") {
    return buildEnvironmentSeries(context, {
      ...range,
      resolution: searchParams.get("resolution") ?? "auto",
    });
  }
  if (endpoint === "/api/v1/aircon/series") {
    return buildAirconSeries(context, range);
  }
  if (endpoint === "/api/v1/daily-summary") {
    return buildDailySummary(context, range);
  }
  return null;
}

function parseRange(
  context: BuildContext,
  searchParams: URLSearchParams,
): { fromMs: number; toMs: number } | null {
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to) {
    return null;
  }
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs) || fromMs >= toMs) {
    return null;
  }
  return { fromMs, toMs };
}
