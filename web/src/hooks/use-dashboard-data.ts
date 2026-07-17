"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";

import { browserApi } from "@/lib/api/browser-client";
import type {
  AirconSeriesData,
  CurrentData,
  DailySummaryData,
  EnvironmentSeriesData,
  StatusData,
} from "@/lib/api/schemas";
import type { ResolvedPeriod } from "@/lib/period";

import { useVisibility } from "./use-visibility";

const POLL_INTERVAL_MS = 60_000;

export interface DashboardInitialData {
  status: StatusData | null;
  current: CurrentData | null;
  currentFailed: boolean;
  environmentSeries: EnvironmentSeriesData | null;
  airconSeries: AirconSeriesData | null;
  dailySummary: DailySummaryData | null;
  historyFailed: boolean;
}

export interface DashboardDataState {
  status: StatusData | null;
  current: CurrentData | null;
  currentError: boolean;
  environmentSeries: EnvironmentSeriesData | null;
  airconSeries: AirconSeriesData | null;
  dailySummary: DailySummaryData | null;
  historyError: boolean;
  historyLoading: boolean;
}

type Action =
  | {
      type: "currentSettled";
      status: StatusData | null;
      current: CurrentData | null;
      failed: boolean;
    }
  | { type: "historyStarted" }
  | {
      type: "historySettled";
      environmentSeries: EnvironmentSeriesData | null;
      airconSeries: AirconSeriesData | null;
      dailySummary: DailySummaryData | null;
      failed: boolean;
    };

function reducer(
  state: DashboardDataState,
  action: Action,
): DashboardDataState {
  switch (action.type) {
    case "currentSettled":
      // Keep the previous data when a refresh fails so the last known
      // values stay on screen alongside the error state.
      return {
        ...state,
        status: action.status ?? state.status,
        current: action.current ?? state.current,
        currentError: action.failed,
      };
    case "historyStarted":
      return { ...state, historyLoading: true };
    case "historySettled":
      return {
        ...state,
        environmentSeries: action.environmentSeries ?? state.environmentSeries,
        airconSeries: action.airconSeries ?? state.airconSeries,
        dailySummary: action.dailySummary ?? state.dailySummary,
        historyError: action.failed,
        historyLoading: false,
      };
  }
}

export interface DashboardDataApi {
  state: DashboardDataState;
  refreshCurrent: () => Promise<void>;
  loadHistory: (period: ResolvedPeriod) => Promise<void>;
}

export function useDashboardData(
  initial: DashboardInitialData,
): DashboardDataApi {
  const [state, dispatch] = useReducer(reducer, initial, (data) => ({
    status: data.status,
    current: data.current,
    currentError: data.currentFailed,
    environmentSeries: data.environmentSeries,
    airconSeries: data.airconSeries,
    dailySummary: data.dailySummary,
    historyError: data.historyFailed,
    historyLoading: false,
  }));

  const currentAbortRef = useRef<AbortController | null>(null);
  const historyAbortRef = useRef<AbortController | null>(null);

  const refreshCurrent = useCallback(async (): Promise<void> => {
    currentAbortRef.current?.abort();
    const controller = new AbortController();
    currentAbortRef.current = controller;
    const [statusResult, currentResult] = await Promise.allSettled([
      browserApi.status({ signal: controller.signal }),
      browserApi.current({ signal: controller.signal }),
    ]);
    if (controller.signal.aborted) {
      return;
    }
    dispatch({
      type: "currentSettled",
      status:
        statusResult.status === "fulfilled" ? statusResult.value.data : null,
      current:
        currentResult.status === "fulfilled" ? currentResult.value.data : null,
      failed:
        statusResult.status === "rejected" ||
        currentResult.status === "rejected",
    });
  }, []);

  const loadHistory = useCallback(
    async (period: ResolvedPeriod): Promise<void> => {
      historyAbortRef.current?.abort();
      const controller = new AbortController();
      historyAbortRef.current = controller;
      dispatch({ type: "historyStarted" });
      const seriesQuery = {
        from: period.series.fromIso,
        to: period.series.toIso,
      };
      const [environmentResult, airconResult, dailyResult] =
        await Promise.allSettled([
          browserApi.environmentSeries(
            { ...seriesQuery, resolution: "auto" },
            { signal: controller.signal },
          ),
          browserApi.airconSeries(seriesQuery, { signal: controller.signal }),
          browserApi.dailySummary(
            {
              from: period.dailySummary.fromIso,
              to: period.dailySummary.toIso,
            },
            { signal: controller.signal },
          ),
        ]);
      if (controller.signal.aborted) {
        return;
      }
      dispatch({
        type: "historySettled",
        environmentSeries:
          environmentResult.status === "fulfilled"
            ? environmentResult.value.data
            : null,
        airconSeries:
          airconResult.status === "fulfilled" ? airconResult.value.data : null,
        dailySummary:
          dailyResult.status === "fulfilled" ? dailyResult.value.data : null,
        failed:
          environmentResult.status === "rejected" ||
          airconResult.status === "rejected" ||
          dailyResult.status === "rejected",
      });
    },
    [],
  );

  const visible = useVisibility();
  const hasPolledRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      return;
    }
    let timer: number | undefined;
    let cancelled = false;
    const schedule = (): void => {
      timer = window.setTimeout(() => {
        void refreshCurrent().then(() => {
          if (!cancelled) {
            schedule();
          }
        });
      }, POLL_INTERVAL_MS);
    };
    // Right after the first mount the SSR data is fresh, so only refetch
    // immediately when the tab becomes visible again later.
    if (hasPolledRef.current) {
      void refreshCurrent().then(() => {
        if (!cancelled) {
          schedule();
        }
      });
    } else {
      hasPolledRef.current = true;
      schedule();
    }
    return () => {
      cancelled = true;
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [visible, refreshCurrent]);

  useEffect(() => {
    const currentAbort = currentAbortRef;
    const historyAbort = historyAbortRef;
    return () => {
      currentAbort.current?.abort();
      historyAbort.current?.abort();
    };
  }, []);

  return { state, refreshCurrent, loadHistory };
}
