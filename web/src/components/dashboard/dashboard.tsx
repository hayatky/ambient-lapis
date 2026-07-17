"use client";

import { useCallback, useMemo, useState, type ReactElement } from "react";

import {
  useDashboardData,
  type DashboardInitialData,
} from "@/hooks/use-dashboard-data";
import { useNow } from "@/hooks/use-now";
import {
  resolvePresetPeriod,
  type PeriodPreset,
  type ResolvedPeriod,
} from "@/lib/period";
import { mapDashboard } from "@/lib/view-model";

import { AirconCard } from "./aircon-card";
import { CurrentSection } from "./current-section";
import { DailySummarySection } from "./daily-summary-section";
import { DashboardHeader } from "./dashboard-header";
import { DataNotes } from "./data-notes";
import { HistorySection } from "./history-section";
import { WarningBanner } from "./warning-banner";
import { WarningIcon } from "./icons";

export interface DashboardProps {
  initial: DashboardInitialData;
  serverNowIso: string;
}

// Client root of the dashboard. Holds refresh/period state, converts the
// raw API data into the display model and lays out the responsive grid
// (mobile single column / tablet two columns / desktop top grid).
export function Dashboard({
  initial,
  serverNowIso,
}: DashboardProps): ReactElement {
  const now = useNow(serverNowIso);
  const { state, refreshCurrent, loadHistory } = useDashboardData(initial);

  const [preset, setPreset] = useState<PeriodPreset>("24h");
  const [appliedPeriod, setAppliedPeriod] = useState<ResolvedPeriod | null>(
    null,
  );

  const onPresetChange = useCallback(
    (nextPreset: PeriodPreset): void => {
      if (nextPreset === preset) {
        return;
      }
      setPreset(nextPreset);
      if (nextPreset !== "custom") {
        const period = resolvePresetPeriod(nextPreset, new Date());
        setAppliedPeriod(period);
        void loadHistory(period);
      }
    },
    [preset, loadHistory],
  );

  const onCustomApply = useCallback(
    (period: ResolvedPeriod): void => {
      setAppliedPeriod(period);
      void loadHistory(period);
    },
    [loadHistory],
  );

  const onHistoryRetry = useCallback((): void => {
    const period =
      appliedPeriod ??
      (preset === "custom" ? null : resolvePresetPeriod(preset, new Date()));
    if (period) {
      void loadHistory(period);
    }
  }, [appliedPeriod, preset, loadHistory]);

  const { status, current, environmentSeries, airconSeries, dailySummary } =
    state;
  const viewModel = useMemo(() => {
    if (!status || !current) {
      return null;
    }
    return mapDashboard(
      { status, current, environmentSeries, airconSeries, dailySummary },
      now,
    );
  }, [status, current, environmentSeries, airconSeries, dailySummary, now]);

  if (!viewModel) {
    // The page shell still renders when the initial fetch failed entirely
    // (§9.1); everything can be retried from the client.
    return (
      <PageFrame>
        <DashboardHeader collectionState={null} lastFullSuccessAt={null} />
        <section
          aria-label="読み込みエラー"
          className="surface-card flex flex-col items-start gap-3 p-6"
        >
          <p className="m-0 flex items-center gap-2 text-[0.9375rem] font-medium text-[var(--danger)]">
            <WarningIcon className="shrink-0" />
            ダッシュボードのデータを取得できませんでした
          </p>
          <p className="m-0 text-[0.8125rem] text-[var(--text-secondary)]">
            収集サービスへ接続できない可能性があります。しばらく待ってから再試行してください。
          </p>
          <button
            type="button"
            onClick={() => {
              void refreshCurrent();
            }}
            className="min-h-[40px] cursor-pointer rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 text-[0.8125rem] font-medium text-[var(--text-primary)] transition-colors duration-150 ease-out hover:border-[var(--accent-lapis)]"
          >
            再試行
          </button>
        </section>
        <DataNotes />
      </PageFrame>
    );
  }

  const collectionStopped = viewModel.warnings.some(
    (warning) => warning.code === "collectionStopped",
  );

  return (
    <PageFrame>
      <DashboardHeader
        collectionState={viewModel.collectionState}
        lastFullSuccessAt={viewModel.lastFullSuccessAt}
      />
      <WarningBanner warnings={viewModel.warnings} />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="order-1 flex flex-col justify-center py-2 md:order-none md:col-start-1 md:row-start-1 lg:py-4">
          <CurrentSection
            environment={viewModel.environment}
            collectionState={viewModel.collectionState}
            error={state.currentError}
            onRetry={() => {
              void refreshCurrent();
            }}
          />
        </div>
        <div className="order-3 md:order-none md:col-start-2 md:row-start-1">
          <AirconCard
            aircon={viewModel.aircon}
            collectionStopped={collectionStopped}
          />
        </div>
        <div className="order-2 md:order-none md:col-span-2 md:row-start-2">
          <HistorySection
            series={viewModel.environmentSeries}
            airconSegments={viewModel.airconSegments}
            preset={preset}
            onPresetChange={onPresetChange}
            onCustomApply={onCustomApply}
            loading={state.historyLoading}
            error={state.historyError}
            onRetry={onHistoryRetry}
            now={now}
          />
        </div>
        <div className="order-4 md:order-none md:col-span-2 md:row-start-3">
          <DailySummarySection days={viewModel.dailySummary} />
        </div>
      </div>
      <DataNotes />
    </PageFrame>
  );
}

function PageFrame({ children }: { children: React.ReactNode }): ReactElement {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col gap-6 px-4 py-6 sm:px-6 lg:gap-8 lg:px-8 lg:py-8">
      {children}
    </main>
  );
}
