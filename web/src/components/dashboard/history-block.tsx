"use client";

import dynamic from "next/dynamic";
import type { ReactElement } from "react";

import { summarizeSeries } from "@/lib/chart/option";
import type {
  AirconSegmentViewModel,
  EnvironmentSeriesViewModel,
} from "@/lib/view-model";

import { ChartSummary } from "./chart-summary";
import type { ChartRange } from "./environment-chart";
import { WarningIcon } from "./icons";

const EnvironmentChart = dynamic(
  () => import("./environment-chart").then((module) => module.default),
  {
    ssr: false,
    loading: () => <ChartPlaceholder label="グラフを読み込んでいます" />,
  },
);

interface HistoryBlockProps {
  series: EnvironmentSeriesViewModel | null;
  airconSegments: AirconSegmentViewModel[];
  range: ChartRange;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

// History block: stacked temperature / humidity panels with the aircon
// ribbon. History errors stay inside this block and never hide the rest
// of the dashboard.
export function HistoryBlock({
  series,
  airconSegments,
  range,
  loading,
  error,
  onRetry,
}: HistoryBlockProps): ReactElement {
  const summary = series ? summarizeSeries(series) : null;

  return (
    <section aria-label="温度と湿度の履歴" className="flex flex-col gap-4">
      <h2 className="section-label m-0">推移</h2>
      {error ? (
        <div className="flex min-h-[280px] flex-col items-start justify-center gap-3 border-l-2 border-[var(--danger)] pl-4">
          <p className="m-0 flex items-center gap-2 text-[0.9375rem] font-medium text-[var(--danger)]">
            <WarningIcon className="shrink-0" />
            履歴データを取得できませんでした
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-[44px] cursor-pointer border-0 bg-transparent p-0 text-[0.875rem] font-medium text-[var(--ink)] underline decoration-[var(--ink-muted)] underline-offset-4 transition-colors duration-150 ease-out hover:decoration-[var(--ink)]"
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
            range={range}
            ariaLabel="温度と湿度の履歴グラフ。詳細は下のテキスト要約を参照してください。"
          />
          <p className="m-0 mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.6875rem] text-[var(--ink-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-4 bg-[var(--ribbon-on)]"
              />
              運転中
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-4 bg-[var(--ribbon-unknown)]"
              />
              不明
            </span>
            <span>空白はエアコンの停止またはデータなし</span>
          </p>
        </div>
      ) : (
        <div className="flex min-h-[280px] items-center justify-center">
          <p className="m-0 text-[0.9375rem] text-[var(--ink-secondary)]">
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
      className="flex h-[420px] w-full items-center justify-center min-[900px]:h-[500px]"
    >
      <p className="m-0 text-[0.8125rem] text-[var(--ink-muted)]">{label}</p>
    </div>
  );
}
