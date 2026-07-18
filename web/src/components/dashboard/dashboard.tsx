"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";

import {
  useDashboardData,
  type DashboardInitialData,
} from "@/hooks/use-dashboard-data";
import { useNow } from "@/hooks/use-now";
import {
  jstDateString,
  resolvePresetPeriod,
  type PeriodPreset,
  type ResolvedPeriod,
} from "@/lib/period";
import { mapDashboard } from "@/lib/view-model";

import { AirconPanel } from "./aircon-panel";
import { CurrentHero } from "./current-hero";
import { DailyRows } from "./daily-rows";
import { DashboardHeader } from "./dashboard-header";
import { DataNotes } from "./data-notes";
import { FilterRow } from "./filter-row";
import { HistoryBlock } from "./history-block";
import { WarningIcon } from "./icons";
import { StatusLine } from "./status-line";

export interface DashboardProps {
  initial: DashboardInitialData;
  serverNowIso: string;
}

// Client root of the dashboard: one continuous folio surface. Holds
// refresh/period state, converts the raw API data into the display model
// and lays out the page (hero + aircon spread, filter row, history,
// daily records).
export function Dashboard({
  initial,
  serverNowIso,
}: DashboardProps): ReactElement {
  const now = useNow(serverNowIso);
  const { state, refreshCurrent, loadHistory } = useDashboardData(initial);

  const [preset, setPreset] = useState<PeriodPreset>("24h");
  const [appliedPeriod, setAppliedPeriod] = useState<ResolvedPeriod>(() =>
    resolvePresetPeriod("24h", new Date(serverNowIso)),
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
    void loadHistory(appliedPeriod);
  }, [appliedPeriod, loadHistory]);

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

  const hasDanger =
    viewModel?.warnings.some((warning) => warning.severity === "danger") ??
    false;

  // A glance from another window: the tab title carries the danger flag.
  useEffect(() => {
    document.title = hasDanger ? "⚠ Ambient Lapis" : "Ambient Lapis";
  }, [hasDanger]);

  if (!viewModel) {
    // The page shell still renders when the initial fetch failed
    // entirely; everything can be retried from the client.
    return (
      <PageFrame>
        <DashboardHeader now={now} />
        <StatusLine
          collectionState={null}
          lastFullSuccessAt={null}
          warnings={[]}
        />
        <section
          aria-label="読み込みエラー"
          className="flex flex-col items-start gap-3 border-l-2 border-[var(--danger)] py-1 pl-4"
        >
          <p className="m-0 flex items-center gap-2 text-[0.9375rem] font-medium text-[var(--danger)]">
            <WarningIcon className="shrink-0" />
            ダッシュボードのデータを取得できませんでした
          </p>
          <p className="m-0 text-[0.8125rem] text-[var(--ink-secondary)]">
            収集サービスへ接続できない可能性があります。しばらく待ってから再試行してください。
          </p>
          <button
            type="button"
            onClick={() => {
              void refreshCurrent();
            }}
            className="min-h-[44px] cursor-pointer border-0 bg-transparent p-0 text-[0.875rem] font-medium text-[var(--ink)] underline decoration-[var(--ink-muted)] underline-offset-4 transition-colors duration-150 ease-out hover:decoration-[var(--ink)]"
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
  const todayDate = jstDateString(now.getTime());
  const todaySummary =
    viewModel.dailySummary.find((day) => day.date === todayDate) ?? null;
  const chartRange = {
    fromMs: Date.parse(appliedPeriod.series.fromIso),
    toMs: Date.parse(appliedPeriod.series.toIso),
  };

  return (
    <PageFrame>
      <div className="flex flex-col gap-4">
        <DashboardHeader now={now} />
        <StatusLine
          collectionState={viewModel.collectionState}
          lastFullSuccessAt={viewModel.lastFullSuccessAt}
          warnings={viewModel.warnings}
        />
      </div>
      <div className="grid grid-cols-1 gap-y-10 min-[900px]:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] min-[900px]:gap-x-16">
        <CurrentHero
          environment={viewModel.environment}
          collectionState={viewModel.collectionState}
          todaySummary={todaySummary}
          dimmed={hasDanger}
          error={state.currentError}
          onRetry={() => {
            void refreshCurrent();
          }}
        />
        <div className="border-t border-[var(--hairline)] pt-8 min-[900px]:self-start min-[900px]:border-t-0 min-[900px]:border-l min-[900px]:pt-0 min-[900px]:pl-10">
          <AirconPanel
            aircon={viewModel.aircon}
            collectionStopped={collectionStopped}
          />
        </div>
      </div>
      <div className="flex flex-col gap-10">
        <FilterRow
          preset={preset}
          onPresetChange={onPresetChange}
          onCustomApply={onCustomApply}
          now={now}
        />
        <HistoryBlock
          series={viewModel.environmentSeries}
          airconSegments={viewModel.airconSegments}
          range={chartRange}
          loading={state.historyLoading}
          error={state.historyError}
          onRetry={onHistoryRetry}
        />
        <DailyRows days={viewModel.dailySummary} />
      </div>
      <DataNotes />
    </PageFrame>
  );
}

function PageFrame({ children }: { children: React.ReactNode }): ReactElement {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1160px] flex-col gap-12 px-5 py-10 sm:px-8 lg:px-12 lg:py-14">
      {children}
    </main>
  );
}
