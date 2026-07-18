"use client";

import { useMemo, useState } from "react";

import {
  jstDateString,
  useDashboardController,
  type DashboardInitialData,
  type DashboardResourceKey,
  type HistoryPreset,
  type ResourceState,
} from "@/lib/dashboard";
import {
  mapAircon,
  mapAirconSegments,
  mapCurrentEnvironment,
  mapDailySummary,
  mapEnvironmentSeries,
  mapWarnings,
  toDisplayTimestamp,
} from "@/lib/view-model";

import { DashboardHeader } from "./header";
import { HistoryChart } from "./history-chart";
import {
  AirconPanel,
  DailySummaryPanel,
  EnvironmentPanel,
  WarningRail,
  type RetryState,
} from "./panels";
import { PeriodSelector, type CustomDateValue } from "./period-selector";
import { WarningIcon } from "./icons";

export interface DashboardClientProps {
  initialData: DashboardInitialData;
}

function latestTimestamp(values: ReadonlyArray<string | undefined>): Date {
  const latest = values.reduce<number>((current, value) => {
    const parsed = value ? Date.parse(value) : Number.NaN;
    return Number.isFinite(parsed) ? Math.max(current, parsed) : current;
  }, 0);
  return new Date(latest > 0 ? latest : Date.now());
}

function errorMessage<T>(resource: ResourceState<T>): string | null {
  if (!resource.error) return null;
  return `${resource.error.title} ${resource.error.detail}`;
}

function retryState<T>(
  resource: ResourceState<T>,
  onRetry: () => void,
): RetryState {
  return {
    errorMessage: errorMessage(resource),
    isLoading: resource.status === "loading",
    isRefreshing: resource.status === "refreshing",
    onRetry,
  };
}

export function DashboardClient({ initialData }: DashboardClientProps) {
  const controller = useDashboardController(initialData);
  const { resources } = controller;
  const statusResponse = resources.status.data;
  const currentResponse = resources.current.data;
  const referenceNow = useMemo(
    () =>
      latestTimestamp([
        initialData.loadedAt,
        statusResponse?.meta.generatedAt,
        currentResponse?.meta.generatedAt,
        resources.environmentSeries.data?.meta.generatedAt,
        resources.airconSeries.data?.meta.generatedAt,
        resources.dailySummary.data?.meta.generatedAt,
      ]),
    [
      currentResponse?.meta.generatedAt,
      initialData.loadedAt,
      resources.airconSeries.data?.meta.generatedAt,
      resources.dailySummary.data?.meta.generatedAt,
      resources.environmentSeries.data?.meta.generatedAt,
      statusResponse?.meta.generatedAt,
    ],
  );

  const status = statusResponse?.data ?? null;
  const current = currentResponse?.data ?? null;
  const warnings = mapWarnings(status, current);
  const environment = current
    ? mapCurrentEnvironment(current, referenceNow)
    : null;
  const aircon = current ? mapAircon(current, referenceNow) : null;
  const environmentSeries = resources.environmentSeries.data
    ? mapEnvironmentSeries(resources.environmentSeries.data.data, referenceNow)
    : null;
  const airconSegments = mapAirconSegments(
    resources.airconSeries.data?.data,
    referenceNow,
  );
  const dailySummary = mapDailySummary(resources.dailySummary.data?.data);

  const lastFullSuccessIso =
    status?.lastFullSuccessAt ?? current?.freshness.lastFullSuccessAt ?? null;
  const lastFullSuccessAt = lastFullSuccessIso
    ? toDisplayTimestamp(lastFullSuccessIso, referenceNow)
    : null;
  const initializing = status?.collectionState === "initializing";
  const liveRefreshing =
    resources.status.status === "refreshing" ||
    resources.current.status === "refreshing";

  const [selectedPreset, setSelectedPreset] = useState<HistoryPreset>(
    initialData.historyRange.preset,
  );
  const [customDates, setCustomDates] = useState<CustomDateValue>(() => ({
    fromDate:
      initialData.historyRange.fromDate ??
      jstDateString(new Date(initialData.dailyRange.from)),
    toDate:
      initialData.historyRange.toDate ??
      jstDateString(new Date(initialData.loadedAt)),
  }));
  const [rangeError, setRangeError] = useState<string | null>(null);

  const retry = (resource: DashboardResourceKey) => {
    void controller.retry(resource);
  };
  const handlePresetChange = (preset: HistoryPreset) => {
    setSelectedPreset(preset);
    setRangeError(null);
    if (preset !== "custom") void controller.selectPreset(preset);
  };
  const handleCustomSubmit = () => {
    const result = controller.selectCustomRange(customDates);
    if (!result.ok) {
      setRangeError(result.error.message);
      return;
    }
    setRangeError(null);
    setSelectedPreset("custom");
  };

  return (
    <main className="dashboard-page">
      <div className="dashboard-frame">
        <DashboardHeader
          collectionState={status?.collectionState ?? "initializing"}
          hasStatusError={resources.status.error !== null}
          isRefreshing={liveRefreshing}
          lastFullSuccessAt={lastFullSuccessAt}
        />

        <WarningRail warnings={warnings} />

        <div className="dashboard-grid">
          <EnvironmentPanel
            environment={environment}
            initializing={initializing}
            state={retryState(resources.current, () => retry("current"))}
          />

          <div className="surface history-panel">
            <HistoryChart
              airconSegments={airconSegments}
              controls={
                <PeriodSelector
                  customDates={customDates}
                  error={rangeError}
                  isLoading={
                    resources.environmentSeries.status === "loading" ||
                    resources.environmentSeries.status === "refreshing"
                  }
                  maxDate={jstDateString(referenceNow)}
                  onCustomDatesChange={setCustomDates}
                  onCustomSubmit={handleCustomSubmit}
                  onPresetChange={handlePresetChange}
                  selected={selectedPreset}
                />
              }
              error={errorMessage(resources.environmentSeries)}
              isLoading={resources.environmentSeries.status === "loading"}
              isRefreshing={resources.environmentSeries.status === "refreshing"}
              onRetry={() => retry("environmentSeries")}
              series={environmentSeries}
            />
            {resources.airconSeries.error ? (
              <div className="history-note" role="status">
                <WarningIcon />
                <span>{errorMessage(resources.airconSeries)}</span>
                <button
                  className="chart-retry-button"
                  onClick={() => retry("airconSeries")}
                  type="button"
                >
                  エアコン履歴を再取得
                </button>
              </div>
            ) : null}
          </div>

          <AirconPanel
            aircon={aircon}
            initializing={initializing}
            state={retryState(resources.current, () => retry("current"))}
          />

          <DailySummaryPanel
            days={dailySummary}
            state={retryState(resources.dailySummary, () =>
              retry("dailySummary"),
            )}
          />
        </div>

        <footer className="dashboard-notes">
          <p>表示時刻はすべて日本時間（JST）です。</p>
          <p>
            欠損・不明・古い値を補完せず、Nature
            Remoから確認できた情報だけを表示します。
          </p>
        </footer>
      </div>
    </main>
  );
}
