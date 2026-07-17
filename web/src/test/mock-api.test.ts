// @vitest-environment node
// Contract tests for the mock Go API: every scenario x endpoint response
// must satisfy the same Zod schemas the BFF enforces, so the mock can
// never drift from the real API contract.

import {
  airconSeriesResponseSchema,
  apiFailureSchema,
  currentResponseSchema,
  dailySummaryResponseSchema,
  environmentSeriesResponseSchema,
  statusResponseSchema,
} from "@/lib/api";

import {
  generateAggregatePoints,
  generateRawPoints,
  selectResolution,
} from "../../test/mock-api/generate.ts";
import {
  buildResponse,
  scenarioNames,
  type MockResponse,
} from "../../test/mock-api/responses.ts";

const NOW_MS = Date.parse("2026-07-18T12:35:00.000Z");
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function call(
  scenario: (typeof scenarioNames)[number],
  endpoint: string,
  params: Record<string, string> = {},
): MockResponse {
  const search = new URLSearchParams(params);
  const response = buildResponse(scenario, endpoint, search, NOW_MS, "test-1");
  if (response === null) {
    throw new Error(`unexpected null response for ${endpoint}`);
  }
  return response;
}

const rangeParams = {
  from: new Date(NOW_MS - DAY_MS).toISOString(),
  to: new Date(NOW_MS).toISOString(),
};

describe("mock API contract", () => {
  const endpoints = [
    {
      path: "/api/v1/status",
      schema: statusResponseSchema,
      params: {},
    },
    {
      path: "/api/v1/current",
      schema: currentResponseSchema,
      params: {},
    },
    {
      path: "/api/v1/environment/series",
      schema: environmentSeriesResponseSchema,
      params: rangeParams,
    },
    {
      path: "/api/v1/aircon/series",
      schema: airconSeriesResponseSchema,
      params: rangeParams,
    },
    {
      path: "/api/v1/daily-summary",
      schema: dailySummaryResponseSchema,
      params: rangeParams,
    },
  ] as const;

  for (const scenario of scenarioNames) {
    for (const endpoint of endpoints) {
      it(`${scenario} ${endpoint.path} matches the API contract`, () => {
        const response = call(scenario, endpoint.path, endpoint.params);
        if (response.status === 200) {
          expect(() => endpoint.schema.parse(response.body)).not.toThrow();
        } else {
          expect(() => apiFailureSchema.parse(response.body)).not.toThrow();
        }
      });
    }
  }

  it("returns failure envelopes for every endpoint in fullError", () => {
    for (const endpoint of endpoints) {
      const response = call("fullError", endpoint.path, endpoint.params);
      expect(response.status).toBe(503);
    }
  });

  it("keeps status and current healthy in historyError", () => {
    expect(call("historyError", "/api/v1/status").status).toBe(200);
    expect(call("historyError", "/api/v1/current").status).toBe(200);
    expect(
      call("historyError", "/api/v1/environment/series", rangeParams).status,
    ).toBe(503);
    expect(
      call("historyError", "/api/v1/daily-summary", rangeParams).status,
    ).toBe(503);
  });

  it("returns 400 when range parameters are missing", () => {
    const response = call("normal", "/api/v1/environment/series");
    expect(response.status).toBe(400);
    expect(() => apiFailureSchema.parse(response.body)).not.toThrow();
  });

  it("returns empty datasets for noData without failing", () => {
    const series = call("noData", "/api/v1/environment/series", rangeParams);
    const parsed = environmentSeriesResponseSchema.parse(series.body);
    expect(parsed.data.points).toHaveLength(0);
    const daily = call("noData", "/api/v1/daily-summary", rangeParams);
    expect(dailySummaryResponseSchema.parse(daily.body).data.days).toHaveLength(
      0,
    );
  });

  it("marks recent points offline in remoOffline", () => {
    const response = call(
      "remoOffline",
      "/api/v1/environment/series",
      rangeParams,
    );
    const parsed = environmentSeriesResponseSchema.parse(response.body);
    const last = parsed.data.points.at(-1);
    expect(last?.remoOnlineState).toBe("offline");
  });

  it("compresses aircon history into contiguous segments", () => {
    const response = call("normal", "/api/v1/aircon/series", rangeParams);
    const parsed = airconSeriesResponseSchema.parse(response.body);
    expect(parsed.data.segments.length).toBeGreaterThan(2);
    for (let index = 1; index < parsed.data.segments.length; index += 1) {
      expect(parsed.data.segments[index]?.from).toBe(
        parsed.data.segments[index - 1]?.to,
      );
    }
    const states = new Set(
      parsed.data.segments.map((segment) => segment.state),
    );
    expect(states.has("on")).toBe(true);
    expect(states.has("off")).toBe(true);
  });
});

describe("mock API resolution selection", () => {
  it("mirrors the Go auto-resolution thresholds", () => {
    expect(selectResolution("auto", 48 * HOUR_MS)).toEqual({
      resolution: "raw",
    });
    expect(selectResolution("auto", 48 * HOUR_MS + 1)).toEqual({
      resolution: "15m",
    });
    expect(selectResolution("auto", 14 * DAY_MS)).toEqual({
      resolution: "15m",
    });
    expect(selectResolution("auto", 14 * DAY_MS + 1)).toEqual({
      resolution: "1h",
    });
    expect(selectResolution("auto", 90 * DAY_MS)).toEqual({ resolution: "1h" });
    expect(selectResolution("auto", 90 * DAY_MS + 1)).toEqual({
      resolution: "1d",
    });
  });

  it("rejects explicit resolutions above their maximum span", () => {
    expect(selectResolution("raw", 49 * HOUR_MS)).toEqual({
      error: "range_too_large",
    });
    expect(selectResolution("15m", 15 * DAY_MS)).toEqual({
      error: "range_too_large",
    });
  });
});

describe("mock API generators", () => {
  const options = {
    fromMs: NOW_MS - 6 * HOUR_MS,
    toMs: NOW_MS,
    dataEndMs: NOW_MS,
  };

  it("generates deterministic raw points", () => {
    expect(generateRawPoints(options)).toEqual(generateRawPoints(options));
  });

  it("breaks the line during the daily maintenance gap", () => {
    const dayOptions = {
      fromMs: Date.parse("2026-07-17T15:00:00.000Z"),
      toMs: Date.parse("2026-07-18T03:00:00.000Z"),
      dataEndMs: NOW_MS,
    };
    const points = generateRawPoints(dayOptions);
    const gapPoints = points.filter((point) => point.gap);
    expect(gapPoints.length).toBeGreaterThan(0);
    for (const point of gapPoints) {
      expect(point.temperature.value).toBeNull();
      expect(point.humidity.value).toBeNull();
    }
  });

  it("keeps aggregate min <= avg <= max", () => {
    const points = generateAggregatePoints({
      fromMs: NOW_MS - 7 * DAY_MS,
      toMs: NOW_MS,
      dataEndMs: NOW_MS,
      resolution: "15m",
    });
    expect(points.length).toBeGreaterThan(100);
    for (const point of points) {
      if (point.gap) {
        continue;
      }
      const { min, avg, max } = point.temperature;
      expect(min).not.toBeNull();
      expect(avg).not.toBeNull();
      expect(max).not.toBeNull();
      if (min !== null && avg !== null && max !== null) {
        expect(min).toBeLessThanOrEqual(avg);
        expect(avg).toBeLessThanOrEqual(max);
      }
    }
  });
});
