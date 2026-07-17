import type { ReactElement } from "react";

import type {
  CurrentEnvironmentViewModel,
  CurrentMetricViewModel,
} from "@/lib/view-model";
import { formatAge } from "@/lib/view-model/time";

import { WarningIcon } from "./icons";

interface CurrentSectionProps {
  environment: CurrentEnvironmentViewModel | null;
  collectionState: "initializing" | "healthy" | "degraded" | "stopped";
  error: boolean;
  onRetry: () => void;
}

// The page hero: current temperature and humidity as the largest figures
// on screen, rendered directly on the canvas without card chrome.
export function CurrentSection({
  environment,
  collectionState,
  error,
  onRetry,
}: CurrentSectionProps): ReactElement {
  return (
    <section aria-label="現在の室内環境" className="flex flex-col gap-5">
      {error ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[12px] border border-[color-mix(in_srgb,var(--danger)_32%,transparent)] bg-[color-mix(in_srgb,var(--danger)_7%,var(--bg-surface))] py-2.5 pr-3 pl-3.5">
          <p className="m-0 flex items-center gap-2.5 text-[0.8125rem] font-medium text-[var(--danger)]">
            <WarningIcon className="shrink-0" />
            最新の値を取得できませんでした
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-[36px] cursor-pointer rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 text-[0.8125rem] font-medium text-[var(--text-primary)] transition-colors duration-150 ease-out hover:border-[var(--accent-lapis)]"
          >
            再試行
          </button>
        </div>
      ) : null}
      {environment ? (
        <>
          <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:gap-12 lg:gap-14">
            <CurrentMetric
              name="温度"
              seriesColor="var(--temperature)"
              metric={environment.temperature}
              staleTitle="温度の計測値が更新されていません"
            />
            <CurrentMetric
              name="湿度"
              seriesColor="var(--humidity)"
              metric={environment.humidity}
              staleTitle="湿度の計測値が更新されていません"
            />
          </div>
          <div className="flex flex-col gap-1 text-[0.8125rem] leading-normal text-[var(--text-secondary)]">
            {environment.remoOnline === false ? (
              <p className="m-0 flex items-center gap-2 font-medium text-[var(--danger)]">
                <WarningIcon className="shrink-0" />
                Nature Remoがオフラインのため、現在値ではない可能性があります
              </p>
            ) : null}
            <p className="m-0">
              取得時刻 {environment.fetchedAt.label} ・ Nature Cloud
              APIからの取得
            </p>
          </div>
        </>
      ) : (
        <div className="flex min-h-[10rem] flex-col justify-center gap-2">
          <p className="m-0 text-lg font-medium text-[var(--text-primary)]">
            {collectionState === "initializing" || collectionState === "healthy"
              ? "収集データはまだありません"
              : "現在の計測値を表示できません"}
          </p>
          <p className="m-0 max-w-md text-[0.8125rem] text-[var(--text-secondary)]">
            {collectionState === "initializing" || collectionState === "healthy"
              ? "初回のデータ収集が完了すると、ここに現在の温度と湿度が表示されます。"
              : "温度と湿度のデータを取得できていません。収集状況は上部の表示を確認してください。"}
          </p>
        </div>
      )}
    </section>
  );
}

function CurrentMetric({
  name,
  seriesColor,
  metric,
  staleTitle,
}: {
  name: string;
  seriesColor: string;
  metric: CurrentMetricViewModel;
  staleTitle: string;
}): ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="m-0 flex items-center gap-2 text-[0.8125rem] font-medium tracking-wide text-[var(--text-secondary)]">
        <span
          aria-hidden="true"
          className="h-[3px] w-4 rounded-full"
          style={{ backgroundColor: seriesColor }}
        />
        {name}
      </p>
      <p className="m-0 flex items-baseline gap-2 whitespace-nowrap text-[var(--text-primary)]">
        <span className="metric-figure">{metric.displayValue}</span>
        <span className="text-xl font-normal text-[var(--text-secondary)]">
          {metric.unit}
        </span>
      </p>
      <div className="flex flex-col gap-0.5 text-[0.8125rem] leading-normal text-[var(--text-secondary)]">
        {metric.stale ? (
          <p className="m-0 flex items-center gap-1.5 font-medium text-[var(--warning)]">
            <WarningIcon className="shrink-0" />
            {staleTitle}
            {metric.observedAt
              ? `(${formatAge(metric.observedAt.ageSeconds)})`
              : ""}
          </p>
        ) : null}
        <p className="m-0">
          {metric.observedAt
            ? `計測時刻 ${metric.observedAt.label}`
            : "計測時刻は不明です"}
        </p>
      </div>
    </div>
  );
}
