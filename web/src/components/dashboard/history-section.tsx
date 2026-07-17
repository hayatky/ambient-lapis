"use client";

import dynamic from "next/dynamic";
import type { ReactElement } from "react";

import { summarizeSeries } from "@/lib/chart/option";
import type { PeriodPreset, ResolvedPeriod } from "@/lib/period";
import type {
  AirconSegmentViewModel,
  EnvironmentSeriesViewModel,
} from "@/lib/view-model";

import { ChartSummary } from "./chart-summary";
import { CustomRangeFields } from "./custom-range-fields";
import { WarningIcon } from "./icons";
import { PeriodSelector } from "./period-selector";

const EnvironmentChart = dynamic(
  () => import("./environment-chart").then((module) => module.default),
  {
    ssr: false,
    loading: () => <ChartPlaceholder label="グラフを読み込んでいます" />,
  },
);

interface HistorySectionProps {
  series: EnvironmentSeriesViewModel | null;
  airconSegments: AirconSegmentViewModel[];
  preset: PeriodPreset;
  onPresetChange: (preset: PeriodPreset) => void;
  onCustomApply: (period: ResolvedPeriod) => void;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  now: Date;
}

// History chart with period selection. History errors stay inside this
// section (§11) and never hide the rest of the dashboard.
export function HistorySection({
  series,
  airconSegments,
  preset,
  onPresetChange,
  onCustomApply,
  loading,
  error,
  onRetry,
  now,
}: HistorySectionProps): ReactElement {
  const summary = series ? summarizeSeries(series) : null;

  return (
    <section
      aria-label="温度と湿度の履歴"
      className="surface-card flex flex-col gap-5 p-6"
    >
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="m-0 text-base font-semibold text-[var(--text-primary)]">
            温度と湿度の推移
          </h2>
          <p className="m-0 flex items-center gap-2 text-[0.8125rem] text-[var(--text-secondary)]">
            <span
              aria-hidden="true"
              className="inline-flex items-center gap-1.5"
            >
              <span className="h-[3px] w-4 rounded-full bg-[var(--temperature)]" />
            </span>
            温度
            <span
              aria-hidden="true"
              className="inline-flex items-center gap-1.5"
            >
              <span className="h-[3px] w-4 rounded-full bg-[var(--humidity)]" />
            </span>
            湿度
            <span
              aria-hidden="true"
              className="inline-block h-3 w-4 rounded-[3px] bg-[color-mix(in_srgb,var(--aircon-on)_18%,transparent)]"
            />
            エアコンON区間
          </p>
        </div>
        <PeriodSelector value={preset} onChange={onPresetChange} />
      </header>
      {preset === "custom" ? (
        <CustomRangeFields now={now} onApply={onCustomApply} />
      ) : null}
      {error ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-[12px] bg-[var(--bg-elevated)]">
          <p className="m-0 flex items-center gap-2 text-[0.9375rem] font-medium text-[var(--danger)]">
            <WarningIcon className="shrink-0" />
            履歴データを取得できませんでした
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-[40px] cursor-pointer rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 text-[0.8125rem] font-medium text-[var(--text-primary)] transition-colors duration-150 ease-out hover:border-[var(--accent-lapis)]"
          >
            再試行
          </button>
        </div>
      ) : loading && !series ? (
        <ChartPlaceholder label="履歴を読み込んでいます" />
      ) : series && series.points.length > 0 ? (
        <div
          aria-busy={loading}
          className={
            loading ? "opacity-60 transition-opacity duration-200" : ""
          }
        >
          <EnvironmentChart
            series={series}
            airconSegments={airconSegments}
            ariaLabel="温度と湿度の履歴グラフ。詳細は下のテキスト要約を参照してください。"
          />
        </div>
      ) : (
        <div className="flex min-h-[320px] items-center justify-center rounded-[12px] bg-[var(--bg-elevated)]">
          <p className="m-0 text-[0.9375rem] text-[var(--text-secondary)]">
            この期間に表示できるデータはありません。
          </p>
        </div>
      )}
      {summary && !error ? <ChartSummary summary={summary} /> : null}
    </section>
  );
}

function ChartPlaceholder({ label }: { label: string }): ReactElement {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-[320px] w-full items-center justify-center rounded-[12px] bg-[var(--bg-elevated)] sm:h-[360px] lg:h-[400px]"
    >
      <p className="m-0 text-[0.8125rem] text-[var(--text-secondary)]">
        {label}
      </p>
    </div>
  );
}
