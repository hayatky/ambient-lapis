"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";

import { browserApi } from "@/lib/api/browser-client";
import type {
  AirconSeriesData,
  CurrentData,
  EnvironmentSeriesData,
  StatusData,
} from "@/lib/api/schemas";
import type { ResolvedPeriod } from "@/lib/period";

import { useVisibility } from "./use-visibility";

const CURRENT_INTERVAL_MS = 60_000;
const HISTORY_INTERVAL_MS = 300_000;

export interface SimpleInitialData {
  status: StatusData | null;
  current: CurrentData | null;
  currentFailed: boolean;
  environmentSeries: EnvironmentSeriesData | null;
  airconSeries: AirconSeriesData | null;
  historyFailed: boolean;
}

export interface SimpleDataState {
  status: StatusData | null;
  current: CurrentData | null;
  currentError: boolean;
  environmentSeries: EnvironmentSeriesData | null;
  airconSeries: AirconSeriesData | null;
  historyError: boolean;
  historyLoading: boolean;
  historyPeriod: ResolvedPeriod | null;
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
      failed: boolean;
      period: ResolvedPeriod;
    };

function reducer(state: SimpleDataState, action: Action): SimpleDataState {
  switch (action.type) {
    case "currentSettled":
      return {
        ...state,
        status: action.status ?? state.status,
        current: action.current ?? state.current,
        currentError: action.failed,
      };
    case "historyStarted":
      return { ...state, historyLoading: true };
    case "historySettled":
      if (action.failed) {
        return {
          ...state,
          historyError: true,
          historyLoading: false,
        };
      }
      return {
        ...state,
        environmentSeries: action.environmentSeries,
        airconSeries: action.airconSeries,
        historyError: false,
        historyLoading: false,
        historyPeriod: action.period,
      };
  }
}

export interface SimpleDataApi {
  state: SimpleDataState;
  refreshCurrent: () => Promise<void>;
  loadHistory: (period: ResolvedPeriod) => Promise<void>;
}

export function useSimpleData(
  initial: SimpleInitialData,
  activePeriod: ResolvedPeriod,
  onPeriodAdvance?: (period: ResolvedPeriod) => void,
): SimpleDataApi {
  const [state, dispatch] = useReducer(reducer, initial, (data) => ({
    status: data.status,
    current: data.current,
    currentError: data.currentFailed,
    environmentSeries: data.environmentSeries,
    airconSeries: data.airconSeries,
    historyError: data.historyFailed,
    historyLoading: false,
    historyPeriod:
      data.environmentSeries !== null || data.airconSeries !== null
        ? activePeriod
        : null,
  }));
  const currentAbortRef = useRef<AbortController | null>(null);
  const historyAbortRef = useRef<AbortController | null>(null);
  const activePeriodRef = useRef(activePeriod);
  const onPeriodAdvanceRef = useRef(onPeriodAdvance);

  useEffect(() => {
    activePeriodRef.current = activePeriod;
    onPeriodAdvanceRef.current = onPeriodAdvance;
  }, [activePeriod, onPeriodAdvance]);

  const refreshCurrent = useCallback(async (): Promise<void> => {
    currentAbortRef.current?.abort();
    const controller = new AbortController();
    currentAbortRef.current = controller;
    const [statusResult, currentResult] = await Promise.allSettled([
      browserApi.status({ signal: controller.signal }),
      browserApi.current({ signal: controller.signal }),
    ]);
    if (controller.signal.aborted) return;
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
      const query = { from: period.series.fromIso, to: period.series.toIso };
      const [environmentResult, airconResult] = await Promise.allSettled([
        browserApi.environmentSeries(
          { ...query, resolution: "auto" },
          { signal: controller.signal },
        ),
        browserApi.airconSeries(query, { signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;
      dispatch({
        type: "historySettled",
        environmentSeries:
          environmentResult.status === "fulfilled"
            ? environmentResult.value.data
            : null,
        airconSeries:
          airconResult.status === "fulfilled" ? airconResult.value.data : null,
        failed:
          environmentResult.status === "rejected" ||
          airconResult.status === "rejected",
        period,
      });
    },
    [],
  );

  const visible = useVisibility();
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!visible) return;
    const refreshSlidingHistory = (): void => {
      const previous = activePeriodRef.current;
      const durationMs =
        Date.parse(previous.series.toIso) - Date.parse(previous.series.fromIso);
      const toMs = Date.now();
      const nextPeriod: ResolvedPeriod = {
        ...previous,
        series: {
          fromIso: new Date(toMs - durationMs).toISOString(),
          toIso: new Date(toMs).toISOString(),
        },
      };
      activePeriodRef.current = nextPeriod;
      onPeriodAdvanceRef.current?.(nextPeriod);
      void loadHistory(nextPeriod);
    };
    if (mountedRef.current) {
      void refreshCurrent();
      refreshSlidingHistory();
    } else {
      mountedRef.current = true;
    }
    const currentTimer = window.setInterval(() => {
      void refreshCurrent();
    }, CURRENT_INTERVAL_MS);
    const historyTimer = window.setInterval(() => {
      refreshSlidingHistory();
    }, HISTORY_INTERVAL_MS);
    return () => {
      window.clearInterval(currentTimer);
      window.clearInterval(historyTimer);
    };
  }, [visible, refreshCurrent, loadHistory]);

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
