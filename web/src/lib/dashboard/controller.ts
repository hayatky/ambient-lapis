"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { browserApi } from "../api/browser-client";
import type { AmbientLapisApi } from "../api";
import { customHistoryRange, historyRangeForPreset } from "./range";
import {
  beginResourceRequest,
  isAbortError,
  settledResource,
} from "./resource";
import type {
  CustomHistoryInput,
  DashboardInitialData,
  DashboardResourceKey,
  DashboardResources,
  HistoryPreset,
  HistoryRange,
  RangeValidationResult,
} from "./types";

const DEFAULT_POLL_INTERVAL_MS = 60_000;
const systemNow = () => new Date();

function invoke<T>(operation: () => Promise<T>): Promise<T> {
  return Promise.resolve().then(operation);
}

export interface DashboardControllerOptions {
  api?: AmbientLapisApi;
  now?: () => Date;
  pollIntervalMs?: number;
}

export interface DashboardController {
  resources: DashboardResources;
  historyRange: HistoryRange;
  refreshLive: () => Promise<void>;
  refreshHistory: (range?: HistoryRange) => Promise<void>;
  refreshDailySummary: () => Promise<void>;
  retry: (resource: DashboardResourceKey) => Promise<void>;
  selectPreset: (preset: Exclude<HistoryPreset, "custom">) => Promise<void>;
  selectCustomRange: (input: CustomHistoryInput) => RangeValidationResult;
}

/**
 * Owns browser-only refresh behavior. The API is injectable so polling,
 * cancellation, and response ordering can be tested without network access.
 */
export function useDashboardController(
  initial: DashboardInitialData,
  options: DashboardControllerOptions = {},
): DashboardController {
  const api = options.api ?? browserApi;
  const clock = options.now ?? systemNow;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  const [resources, setResources] = useState(initial.resources);
  const [historyRange, setHistoryRange] = useState(initial.historyRange);
  const historyRangeRef = useRef(initial.historyRange);
  const disposedRef = useRef(false);

  const liveRequestRef = useRef<Promise<void> | null>(null);
  const liveAbortRef = useRef<AbortController | null>(null);
  const liveSequenceRef = useRef(0);
  const historyAbortRef = useRef<AbortController | null>(null);
  const historySequenceRef = useRef(0);
  const dailyAbortRef = useRef<AbortController | null>(null);
  const dailySequenceRef = useRef(0);

  const refreshLive = useCallback((): Promise<void> => {
    if (liveRequestRef.current) return liveRequestRef.current;

    setResources((previous) => ({
      ...previous,
      status: beginResourceRequest(previous.status),
      current: beginResourceRequest(previous.current),
    }));

    const controller = new AbortController();
    liveAbortRef.current = controller;
    const sequence = ++liveSequenceRef.current;
    const request = (async () => {
      const result = await Promise.allSettled([
        invoke(() => api.status({ signal: controller.signal })),
        invoke(() => api.current({ signal: controller.signal })),
      ]);
      if (
        disposedRef.current ||
        sequence !== liveSequenceRef.current ||
        controller.signal.aborted
      ) {
        return;
      }
      setResources((previous) => ({
        ...previous,
        status: settledResource(result[0], previous.status),
        current: settledResource(result[1], previous.current),
      }));
    })();
    liveRequestRef.current = request;
    void request.finally(() => {
      if (liveRequestRef.current === request) liveRequestRef.current = null;
    });
    return request;
  }, [api]);

  const refreshHistory = useCallback(
    async (requestedRange?: HistoryRange): Promise<void> => {
      const range = requestedRange ?? historyRangeRef.current;
      historyAbortRef.current?.abort();
      const controller = new AbortController();
      historyAbortRef.current = controller;
      const sequence = ++historySequenceRef.current;

      setResources((previous) => ({
        ...previous,
        environmentSeries: beginResourceRequest(previous.environmentSeries),
        airconSeries: beginResourceRequest(previous.airconSeries),
      }));

      const result = await Promise.allSettled([
        invoke(() =>
          api.environmentSeries(
            { from: range.from, to: range.to, resolution: "auto" },
            { signal: controller.signal },
          ),
        ),
        invoke(() => api.airconSeries(range, { signal: controller.signal })),
      ]);
      if (
        disposedRef.current ||
        sequence !== historySequenceRef.current ||
        controller.signal.aborted
      ) {
        return;
      }
      setResources((previous) => ({
        ...previous,
        environmentSeries:
          result[0].status === "rejected" && isAbortError(result[0].reason)
            ? previous.environmentSeries
            : settledResource(result[0], previous.environmentSeries),
        airconSeries:
          result[1].status === "rejected" && isAbortError(result[1].reason)
            ? previous.airconSeries
            : settledResource(result[1], previous.airconSeries),
      }));
    },
    [api],
  );

  const refreshDailySummary = useCallback(async (): Promise<void> => {
    dailyAbortRef.current?.abort();
    const controller = new AbortController();
    dailyAbortRef.current = controller;
    const sequence = ++dailySequenceRef.current;
    setResources((previous) => ({
      ...previous,
      dailySummary: beginResourceRequest(previous.dailySummary),
    }));

    const result = await Promise.allSettled([
      invoke(() =>
        api.dailySummary(initial.dailyRange, { signal: controller.signal }),
      ),
    ]);
    if (
      disposedRef.current ||
      sequence !== dailySequenceRef.current ||
      controller.signal.aborted
    ) {
      return;
    }
    setResources((previous) => ({
      ...previous,
      dailySummary:
        result[0].status === "rejected" && isAbortError(result[0].reason)
          ? previous.dailySummary
          : settledResource(result[0], previous.dailySummary),
    }));
  }, [api, initial.dailyRange]);

  const selectPreset = useCallback(
    async (preset: Exclude<HistoryPreset, "custom">): Promise<void> => {
      const range = historyRangeForPreset(preset, clock());
      historyRangeRef.current = range;
      setHistoryRange(range);
      await refreshHistory(range);
    },
    [clock, refreshHistory],
  );

  const selectCustomRange = useCallback(
    (input: CustomHistoryInput): RangeValidationResult => {
      const result = customHistoryRange(input, clock());
      if (result.ok) {
        historyRangeRef.current = result.value;
        setHistoryRange(result.value);
        void refreshHistory(result.value);
      }
      return result;
    },
    [clock, refreshHistory],
  );

  const retry = useCallback(
    async (resource: DashboardResourceKey): Promise<void> => {
      switch (resource) {
        case "status":
        case "current":
          await refreshLive();
          return;
        case "environmentSeries":
        case "airconSeries":
          await refreshHistory();
          return;
        case "dailySummary":
          await refreshDailySummary();
      }
    },
    [refreshDailySummary, refreshHistory, refreshLive],
  );

  useEffect(() => {
    const initialLiveFailed =
      initial.resources.status.status === "error" ||
      initial.resources.current.status === "error";
    const initialHistoryFailed =
      initial.resources.environmentSeries.status === "error" ||
      initial.resources.airconSeries.status === "error";
    const timeoutId = setTimeout(() => {
      if (initialLiveFailed) void refreshLive();
      if (initialHistoryFailed) void refreshHistory(initial.historyRange);
      if (initial.resources.dailySummary.status === "error") {
        void refreshDailySummary();
      }
    }, 0);
    return () => clearTimeout(timeoutId);
    // This effect intentionally reflects only the serialized initial state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
      if (intervalId !== undefined) clearInterval(intervalId);
      intervalId = undefined;
    };
    const start = () => {
      stop();
      if (document.visibilityState !== "visible") return;
      intervalId = setInterval(() => void refreshLive(), pollIntervalMs);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshLive();
        start();
      } else {
        stop();
      }
    };

    start();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pollIntervalMs, refreshLive]);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      liveSequenceRef.current += 1;
      historySequenceRef.current += 1;
      dailySequenceRef.current += 1;
      liveAbortRef.current?.abort();
      historyAbortRef.current?.abort();
      dailyAbortRef.current?.abort();
      liveRequestRef.current = null;
    };
  }, []);

  return {
    resources,
    historyRange,
    refreshLive,
    refreshHistory,
    refreshDailySummary,
    retry,
    selectPreset,
    selectCustomRange,
  };
}
