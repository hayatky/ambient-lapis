import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AirconSeriesResponse,
  AmbientLapisApi,
  CurrentResponse,
  EnvironmentSeriesResponse,
  StatusResponse,
} from "../api";
import {
  aggregateEnvironmentSeriesFixture,
  fixtureScenarios,
  FIXTURE_NOW,
  rawEnvironmentSeriesFixture,
} from "@/test/fixtures";
import { useDashboardController } from "./controller";
import { dailySummaryRange, historyRangeForPreset } from "./range";
import { failResource, loadingResource, readyResource } from "./resource";
import type { DashboardInitialData } from "./types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function initialData(): DashboardInitialData {
  const fixture = fixtureScenarios.normal;
  const now = new Date(FIXTURE_NOW);
  return {
    loadedAt: FIXTURE_NOW,
    historyRange: historyRangeForPreset("24h", now),
    dailyRange: dailySummaryRange(now),
    resources: {
      status: readyResource(fixture.status),
      current: readyResource(fixture.current),
      environmentSeries: readyResource(fixture.environmentSeries),
      airconSeries: readyResource(fixture.airconSeries),
      dailySummary: readyResource(fixture.dailySummary),
    },
  };
}

function api(overrides: Partial<AmbientLapisApi> = {}): AmbientLapisApi {
  const fixture = fixtureScenarios.normal;
  return {
    status: vi.fn().mockResolvedValue(fixture.status),
    current: vi.fn().mockResolvedValue(fixture.current),
    environmentSeries: vi.fn().mockResolvedValue(fixture.environmentSeries),
    airconSeries: vi.fn().mockResolvedValue(fixture.airconSeries),
    dailySummary: vi.fn().mockResolvedValue(fixture.dailySummary),
    ...overrides,
  };
}

let originalVisibility: PropertyDescriptor | undefined;

function setVisibility(value: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  originalVisibility = Object.getOwnPropertyDescriptor(
    document,
    "visibilityState",
  );
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
});

afterEach(() => {
  vi.useRealTimers();
  if (originalVisibility) {
    Object.defineProperty(document, "visibilityState", originalVisibility);
  } else {
    Reflect.deleteProperty(document, "visibilityState");
  }
});

describe("useDashboardController", () => {
  it("immediately retries live resources that failed during SSR", async () => {
    vi.useFakeTimers();
    const client = api();
    const initial = initialData();
    initial.resources.current = failResource(
      loadingResource(),
      new TypeError("SSR unavailable"),
    );
    const { result } = renderHook(() =>
      useDashboardController(initial, { api: client }),
    );

    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(client.status).toHaveBeenCalledTimes(1);
    expect(client.current).toHaveBeenCalledTimes(1);
    expect(result.current.resources.current.status).toBe("ready");
  });

  it("retains last-good live data when a refresh fails", async () => {
    const client = api({
      status: vi.fn().mockRejectedValue(new TypeError("offline")),
      current: vi.fn().mockRejectedValue(new TypeError("offline")),
    });
    const initial = initialData();
    const { result } = renderHook(() =>
      useDashboardController(initial, { api: client }),
    );

    await act(() => result.current.refreshLive());

    expect(result.current.resources.status).toMatchObject({
      status: "error",
      data: initial.resources.status.data,
      error: { code: "unavailable" },
    });
    expect(result.current.resources.current).toMatchObject({
      status: "error",
      data: initial.resources.current.data,
      error: { code: "unavailable" },
    });
  });

  it("polls every 60 seconds without overlapping an in-flight refresh", async () => {
    vi.useFakeTimers();
    const pendingStatus = deferred<StatusResponse>();
    const pendingCurrent = deferred<CurrentResponse>();
    const client = api({
      status: vi.fn().mockReturnValue(pendingStatus.promise),
      current: vi.fn().mockReturnValue(pendingCurrent.promise),
    });
    renderHook(() => useDashboardController(initialData(), { api: client }));

    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(client.status).toHaveBeenCalledTimes(1);
    expect(client.current).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(120_000));
    expect(client.status).toHaveBeenCalledTimes(1);
    expect(client.current).toHaveBeenCalledTimes(1);

    await act(async () => {
      pendingStatus.resolve(fixtureScenarios.normal.status);
      pendingCurrent.resolve(fixtureScenarios.normal.current);
      await Promise.resolve();
    });
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(client.status).toHaveBeenCalledTimes(2);
    expect(client.current).toHaveBeenCalledTimes(2);
  });

  it("stops polling while hidden and refreshes immediately on return", async () => {
    vi.useFakeTimers();
    const client = api();
    renderHook(() => useDashboardController(initialData(), { api: client }));

    act(() => setVisibility("hidden"));
    await act(() => vi.advanceTimersByTimeAsync(180_000));
    expect(client.status).not.toHaveBeenCalled();

    await act(async () => setVisibility("visible"));
    expect(client.status).toHaveBeenCalledTimes(1);
    expect(client.current).toHaveBeenCalledTimes(1);
  });

  it("aborts an old history request and ignores its late response", async () => {
    const environment = [
      deferred<EnvironmentSeriesResponse>(),
      deferred<EnvironmentSeriesResponse>(),
    ];
    const aircon = [
      deferred<AirconSeriesResponse>(),
      deferred<AirconSeriesResponse>(),
    ];
    const environmentSeries = vi
      .fn<AmbientLapisApi["environmentSeries"]>()
      .mockImplementationOnce(() => environment[0]!.promise)
      .mockImplementationOnce(() => environment[1]!.promise);
    const airconSeries = vi
      .fn<AmbientLapisApi["airconSeries"]>()
      .mockImplementationOnce(() => aircon[0]!.promise)
      .mockImplementationOnce(() => aircon[1]!.promise);
    const client = api({ environmentSeries, airconSeries });
    const { result } = renderHook(() =>
      useDashboardController(initialData(), {
        api: client,
        now: () => new Date(FIXTURE_NOW),
      }),
    );

    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => {
      first = result.current.selectPreset("7d");
      await Promise.resolve();
    });
    act(() => {
      second = result.current.selectPreset("30d");
    });

    expect(environmentSeries.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    await act(async () => {
      environment[1]!.resolve(aggregateEnvironmentSeriesFixture);
      aircon[1]!.resolve(fixtureScenarios.normal.airconSeries);
      await second;
    });
    expect(result.current.resources.environmentSeries.data).toBe(
      aggregateEnvironmentSeriesFixture,
    );
    expect(result.current.historyRange.preset).toBe("30d");

    await act(async () => {
      environment[0]!.resolve(rawEnvironmentSeriesFixture);
      aircon[0]!.resolve(fixtureScenarios.normal.airconSeries);
      await first;
    });
    expect(result.current.resources.environmentSeries.data).toBe(
      aggregateEnvironmentSeriesFixture,
    );
  });

  it("does not request history for an invalid custom range", () => {
    const client = api();
    const { result } = renderHook(() =>
      useDashboardController(initialData(), {
        api: client,
        now: () => new Date(FIXTURE_NOW),
      }),
    );

    let validation!: ReturnType<typeof result.current.selectCustomRange>;
    act(() => {
      validation = result.current.selectCustomRange({
        fromDate: "2026-07-19",
        toDate: "2026-07-19",
      });
    });

    expect(validation).toMatchObject({
      ok: false,
      error: { code: "futureDate" },
    });
    expect(client.environmentSeries).not.toHaveBeenCalled();
    expect(client.airconSeries).not.toHaveBeenCalled();
  });
});
