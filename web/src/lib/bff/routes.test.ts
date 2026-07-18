// @vitest-environment node

import { z } from "zod";

import { GET as getAirconSeries } from "@/app/api/v1/aircon/series/route";
import { GET as getCurrent } from "@/app/api/v1/current/route";
import { GET as getDailySummary } from "@/app/api/v1/daily-summary/route";
import { GET as getEnvironmentSeries } from "@/app/api/v1/environment/series/route";
import { GET as getApiV1Root } from "@/app/api/v1/route";
import {
  GET as getUnknown,
  POST as postUnknown,
} from "@/app/api/v1/[...path]/route";
import {
  GET as getStatus,
  HEAD as headStatus,
  POST as postStatus,
} from "@/app/api/v1/status/route";
import { statusResponseSchema } from "@/lib/api/schemas";

import { proxyToGo } from "./proxy";

const meta = {
  requestId: "request-test",
  generatedAt: "2026-07-18T12:34:56.789Z",
  timezone: "Asia/Tokyo",
};

const statusSuccess = {
  data: {
    collectionState: "healthy",
    lastFullSuccessAt: "2026-07-18T12:33:00.000Z",
    lastEnvironmentSuccessAt: "2026-07-18T12:33:00.000Z",
    lastAirconSuccessAt: "2026-07-18T12:33:01.000Z",
    lastRun: {
      startedAt: "2026-07-18T12:33:00.000Z",
      completedAt: "2026-07-18T12:33:01.200Z",
      overallStatus: "success",
      devicesStatus: "success",
      appliancesStatus: "success",
      errorCodes: [],
    },
    pollIntervalSeconds: 300,
    staleAfterSeconds: 600,
  },
  meta,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

describe.sequential("BFF route handlers", () => {
  const originalBaseUrl = process.env.REMO_API_BASE_URL;
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    process.env.REMO_API_BASE_URL = "http://remo-api.test:8080";
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalBaseUrl === undefined) delete process.env.REMO_API_BASE_URL;
    else process.env.REMO_API_BASE_URL = originalBaseUrl;
  });

  it("proxies a valid response on the fixed status path", async () => {
    fetchMock.mockResolvedValue(jsonResponse(statusSuccess));

    const response = await getStatus(
      new Request("http://web.local/api/v1/status"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    await expect(response.json()).resolves.toEqual(statusSuccess);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [target, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(target)).toBe("http://remo-api.test:8080/api/v1/status");
    expect(init).toMatchObject({
      method: "GET",
      cache: "no-store",
      redirect: "error",
    });
  });

  it.each([
    {
      name: "current",
      handler: getCurrent,
      requestUrl: "http://web.local/api/v1/current",
      upstreamPath: "/api/v1/current",
      cacheControl: "no-store",
      body: {
        data: {
          environment: null,
          aircon: null,
          freshness: {
            collectionStopped: false,
            lastFullSuccessAt: null,
          },
        },
        meta,
      },
    },
    {
      name: "aircon series",
      handler: getAirconSeries,
      requestUrl:
        "http://web.local/api/v1/aircon/series?from=2026-07-18T12%3A00%3A00Z&to=2026-07-18T13%3A00%3A00Z",
      upstreamPath: "/api/v1/aircon/series",
      cacheControl: "private, max-age=30",
      body: {
        data: { segments: [] },
        meta: { ...meta, limit: 10_000, truncated: false },
      },
    },
    {
      name: "daily summary",
      handler: getDailySummary,
      requestUrl:
        "http://web.local/api/v1/daily-summary?from=2026-07-18T12%3A00%3A00Z&to=2026-07-18T13%3A00%3A00Z",
      upstreamPath: "/api/v1/daily-summary",
      cacheControl: "private, max-age=30",
      body: {
        data: { days: [] },
        meta: { ...meta, limit: 10_000, truncated: false },
      },
    },
  ])(
    "proxies a valid $name response using its fixed path and cache policy",
    async ({ handler, requestUrl, upstreamPath, cacheControl, body }) => {
      fetchMock.mockResolvedValue(jsonResponse(body));

      const response = await handler(new Request(requestUrl));

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe(cacheControl);
      await expect(response.json()).resolves.toEqual(body);
      const [target] = fetchMock.mock.calls[0] ?? [];
      expect(new URL(String(target)).pathname).toBe(upstreamPath);
    },
  );

  it("preserves a valid upstream error envelope and status", async () => {
    const body = {
      error: {
        code: "not_ready",
        message: "service is not ready",
      },
      meta: {
        requestId: "request-error",
        generatedAt: "2026-07-18T12:34:56.789Z",
      },
    };
    fetchMock.mockResolvedValue(jsonResponse(body, 503));

    const response = await getStatus(
      new Request("http://web.local/api/v1/status"),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(body);
  });

  it("never caches a validated error from a history endpoint", async () => {
    const body = {
      error: {
        code: "upstream_unavailable",
        message: "history is temporarily unavailable",
      },
      meta: {
        requestId: "request-history-error",
        generatedAt: "2026-07-18T12:34:56.789Z",
      },
    };
    fetchMock.mockResolvedValue(jsonResponse(body, 503));

    const response = await getEnvironmentSeries(
      new Request(
        "http://web.local/api/v1/environment/series?from=2026-07-18T12%3A00%3A00Z&to=2026-07-18T13%3A00%3A00Z&resolution=raw",
      ),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(body);
  });

  it.each([
    ["invalid JSON", new Response("not-json")],
    [
      "a contract-invalid response",
      jsonResponse({
        ...statusSuccess,
        data: { collectionState: "future-state" },
      }),
    ],
    [
      "a response envelope that does not match its HTTP status",
      jsonResponse(statusSuccess, 503),
    ],
  ])("turns %s into a redacted 502", async (_name, upstreamResponse) => {
    fetchMock.mockResolvedValue(upstreamResponse);

    const response = await getStatus(
      new Request("http://web.local/api/v1/status"),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      error: {
        code: "bad_gateway",
        message: "upstream service is unavailable",
      },
    });
    expect(JSON.stringify(body)).not.toContain("future-state");
    expect(JSON.stringify(body)).not.toContain("not-json");
  });

  it("returns a redacted 502 for missing configuration", async () => {
    delete process.env.REMO_API_BASE_URL;
    const response = await getStatus(
      new Request("http://web.local/api/v1/status"),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "bad_gateway" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the shared JSON 404 response for the API v1 root", async () => {
    const response = getApiV1Root();

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "not_found",
        message: "resource not found",
      },
      meta: {
        requestId: expect.any(String),
        generatedAt: expect.any(String),
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["POST", postStatus],
    ["HEAD", headStatus],
  ])(
    "returns the shared JSON 405 response for %s",
    async (_method, handler) => {
      const response = handler();

      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("content-type")).toBe(
        "application/json; charset=utf-8",
      );
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: "method_not_allowed",
          message: "method not allowed",
        },
        meta: {
          requestId: expect.any(String),
          generatedAt: expect.any(String),
        },
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["GET", getUnknown],
    ["POST", postUnknown],
  ])(
    "returns the shared JSON 404 response for unknown-path %s",
    async (_method, handler) => {
      const response = handler();

      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("content-type")).toBe(
        "application/json; charset=utf-8",
      );
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: "not_found",
          message: "resource not found",
        },
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("returns a redacted 502 when the upstream connection fails", async () => {
    fetchMock.mockRejectedValue(
      new TypeError("connection refused at private path"),
    );

    const response = await getStatus(
      new Request("http://web.local/api/v1/status"),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(JSON.stringify(body)).not.toContain("private path");
  });

  it("enforces the upstream timeout", async () => {
    fetchMock.mockImplementation(
      (_target, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );

    const response = await proxyToGo(
      new Request("http://web.local/api/v1/status"),
      {
        path: "/api/v1/status",
        cachePolicy: "current",
        successSchema: statusResponseSchema,
        failureSchema: z.never(),
        timeoutMs: 10,
      },
    );

    expect(response.status).toBe(502);
  });

  it("forwards only validated history queries and sets short private caching", async () => {
    const body = {
      data: { resolution: "raw", points: [] },
      meta: {
        ...meta,
        from: "2026-07-18T12:00:00.000Z",
        to: "2026-07-18T13:00:00.000Z",
        limit: 10_000,
        truncated: false,
      },
    };
    fetchMock.mockResolvedValue(jsonResponse(body));

    const response = await getEnvironmentSeries(
      new Request(
        "http://web.local/api/v1/environment/series?to=2026-07-18T13%3A00%3A00Z&from=2026-07-18T12%3A00%3A00Z&resolution=raw",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, max-age=30");
    const [target, init] = fetchMock.mock.calls[0] ?? [];
    const upstreamUrl = new URL(String(target));
    expect(upstreamUrl.pathname).toBe("/api/v1/environment/series");
    expect(Object.fromEntries(upstreamUrl.searchParams)).toEqual({
      from: "2026-07-18T12:00:00Z",
      to: "2026-07-18T13:00:00Z",
      resolution: "raw",
    });
    expect(init?.cache).toBe("default");
  });

  it("does not contact the upstream for an invalid route query", async () => {
    const response = await getEnvironmentSeries(
      new Request(
        "http://web.local/api/v1/environment/series?from=no&to=2026-07-18T13%3A00%3A00Z",
      ),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("supports a generic schema for isolated proxy tests", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    const response = await proxyToGo(new Request("http://web.local/test"), {
      path: "/test",
      cachePolicy: "current",
      successSchema: z.object({ ok: z.literal(true) }),
      failureSchema: z.never(),
    });
    expect(response.status).toBe(200);
  });
});
