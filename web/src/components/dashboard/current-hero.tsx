import type { ReactElement } from "react";

import type {
  CurrentEnvironmentViewModel,
  CurrentMetricViewModel,
  DailySummaryViewModel,
} from "@/lib/view-model";
import { formatAge } from "@/lib/view-model/time";

import { WarningIcon } from "./icons";

interface CurrentHeroProps {
  environment: CurrentEnvironmentViewModel | null;
  collectionState: "initializing" | "healthy" | "degraded" | "stopped";
  todaySummary: DailySummaryViewModel | null;
  // Collection stopped / Remo offline: the page visibly "goes quiet" —
  // the hero renders in secondary ink instead of full ink.
  dimmed: boolean;
  error: boolean;
  onRetry: () => void;
}

// The page's instrument readout: current temperature as the single hero
// figure (mixed-scale numerals, left-aligned, proportional figures),
// humidity as its smaller companion.
export function CurrentHero({
  environment,
  collectionState,
  todaySummary,
  dimmed,
  error,
  onRetry,
}: CurrentHeroProps): ReactElement {
  return (
    <section aria-label="現在の室内環境" className="flex flex-col gap-5">
      {error ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-l-2 border-[var(--danger)] py-1 pl-3">
          <p className="m-0 flex items-center gap-2 text-[0.8125rem] font-medium text-[var(--danger)]">
            <WarningIcon className="shrink-0" />
            最新の値を取得できませんでした
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-[44px] cursor-pointer border-0 bg-transparent p-0 text-[0.8125rem] font-medium text-[var(--ink)] underline decoration-[var(--ink-muted)] underline-offset-4 transition-colors duration-150 ease-out hover:decoration-[var(--ink)]"
          >
            再試行
          </button>
        </div>
      ) : null}
      {environment ? (
        <>
          <div className="flex flex-col gap-7 min-[900px]:flex-row min-[900px]:items-end min-[900px]:gap-12">
            <HeroFigure
              name="温度"
              seriesColor="var(--temperature)"
              metric={environment.temperature}
              unit="°C"
              scaleClass="text-[clamp(4rem,11vw,7rem)]"
              dimmed={dimmed}
              staleTitle="温度の計測値が更新されていません"
            />
            <HeroFigure
              name="湿度"
              seriesColor="var(--humidity)"
              metric={environment.humidity}
              unit="%"
              scaleClass="text-[clamp(2.125rem,5vw,3.25rem)]"
              dimmed={dimmed}
              staleTitle="湿度の計測値が更新されていません"
            />
          </div>
          {todaySummary?.temperature ? (
            <p className="m-0 text-[0.9375rem] text-[var(--ink-secondary)]">
              今日{" "}
              <span className="tabular-nums">
                最低 {formatRange(todaySummary.temperature.minimum)}° ／ 最高{" "}
                {formatRange(todaySummary.temperature.maximum)}°
              </span>
              {todaySummary.humidity ? (
                <span className="ml-3 tabular-nums">
                  湿度 {formatRange(todaySummary.humidity.minimum, 0)}–
                  {formatRange(todaySummary.humidity.maximum, 0)}%
                </span>
              ) : null}
            </p>
          ) : null}
          <div className="flex flex-col gap-1 text-[0.8125rem] leading-normal">
            {environment.remoOnline === false ? (
              <p className="m-0 flex items-center gap-2 font-medium text-[var(--danger)]">
                <WarningIcon className="shrink-0" />
                Nature Remoがオフラインのため、現在値ではない可能性があります
              </p>
            ) : null}
            <p className="m-0 text-[var(--ink-muted)]">
              取得時刻 {environment.fetchedAt.label} ・ Nature Cloud
              APIからの取得
            </p>
          </div>
        </>
      ) : (
        <div className="flex min-h-[9rem] flex-col justify-center gap-2">
          <p className="m-0 text-lg font-medium text-[var(--ink)]">
            {collectionState === "initializing" || collectionState === "healthy"
              ? "収集データはまだありません"
              : "現在の計測値を表示できません"}
          </p>
          <p className="m-0 max-w-md text-[0.8125rem] text-[var(--ink-secondary)]">
            {collectionState === "initializing" || collectionState === "healthy"
              ? "初回のデータ収集が完了すると、ここに現在の温度と湿度が表示されます。"
              : "温度と湿度のデータを取得できていません。収集状況は上部の表示を確認してください。"}
          </p>
        </div>
      )}
    </section>
  );
}

function formatRange(value: number | null, digits = 1): string {
  return value === null ? "--" : value.toFixed(digits);
}

function HeroFigure({
  name,
  seriesColor,
  metric,
  unit,
  scaleClass,
  dimmed,
  staleTitle,
}: {
  name: string;
  seriesColor: string;
  metric: CurrentMetricViewModel;
  unit: string;
  scaleClass: string;
  dimmed: boolean;
  staleTitle: string;
}): ReactElement {
  const [integerPart, decimalPart] = metric.displayValue.split(".");
  const inkClass = dimmed ? "text-[var(--ink-secondary)]" : "text-[var(--ink)]";
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <p className="section-label m-0 flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-[3px] w-4 rounded-full"
          style={{ backgroundColor: seriesColor }}
        />
        {name}
      </p>
      <p
        className={`hero-figure m-0 whitespace-nowrap ${scaleClass} ${inkClass}`}
      >
        {integerPart}
        {decimalPart !== undefined ? (
          <span className="hero-figure-minor text-[0.52em] text-[var(--ink-secondary)]">
            .{decimalPart}
          </span>
        ) : null}
        <span className="hero-figure-minor ml-[0.1em] text-[0.42em] text-[var(--ink-secondary)]">
          {unit}
        </span>
      </p>
      <div className="flex flex-col gap-0.5 text-[0.8125rem] leading-normal">
        {metric.stale ? (
          <p className="m-0 flex items-center gap-1.5 font-medium text-[var(--warning)]">
            <WarningIcon className="shrink-0" />
            {staleTitle}
            {metric.observedAt
              ? `(${formatAge(metric.observedAt.ageSeconds)})`
              : ""}
          </p>
        ) : null}
        <p className="m-0 text-[var(--ink-muted)]">
          {metric.observedAt
            ? `計測時刻 ${metric.observedAt.label}`
            : "計測時刻は不明です"}
        </p>
      </div>
    </div>
  );
}
