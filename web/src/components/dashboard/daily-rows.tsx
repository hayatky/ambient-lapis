import type { ReactElement } from "react";

import {
  humidityScale,
  scalePosition,
  temperatureScale,
  type RangeScale,
} from "@/lib/daily-range";
import type {
  DailyMetricViewModel,
  DailySummaryViewModel,
} from "@/lib/view-model";

import { WarningIcon } from "./icons";

const weekdayFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  weekday: "narrow",
});

function dayParts(date: string): {
  day: string;
  weekday: string;
  month: number;
} {
  const [, month, day] = date.split("-");
  const weekday = weekdayFormatter.format(new Date(`${date}T00:00:00+09:00`));
  return {
    day: String(Number(day ?? "0")),
    weekday,
    month: Number(month ?? "0"),
  };
}

interface DailyRowsProps {
  days: DailySummaryViewModel[];
}

// The daily record: one 32px row per day with min→max range bars on a
// shared per-metric scale (a gold tick marks the average), newest first.
// Absence stays visible: missing metrics render as an em-dash, gap
// minutes are stated per row.
export function DailyRows({ days }: DailyRowsProps): ReactElement {
  const tempScale = temperatureScale(days);
  const humScale = humidityScale(days);

  return (
    <section aria-label="日次サマリー" className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="section-label m-0">日別記録</h2>
        <p className="m-0 text-[0.75rem] text-[var(--ink-muted)]">
          温度と湿度の最低 / 平均 / 最高 ・ 平均は
          <span
            aria-hidden="true"
            className="mx-1 inline-block h-[10px] w-[2px] bg-[var(--gold)] align-[-1px]"
          />
          金のティック
        </p>
      </header>
      {days.length === 0 ? (
        <p className="m-0 text-[0.9375rem] text-[var(--ink-secondary)]">
          日次サマリーはまだありません。
        </p>
      ) : (
        <div className="flex flex-col">
          {/* Scale rulers (desktop layout shares the row grid) */}
          <div className="daily-grid hidden min-[900px]:grid">
            <span />
            {tempScale ? <Ruler scale={tempScale} unit="°" /> : <span />}
            <span />
            {humScale ? <Ruler scale={humScale} unit="%" /> : <span />}
            <span />
          </div>
          <ol className="m-0 flex list-none flex-col p-0">
            {days.map((day, index) => {
              const parts = dayParts(day.date);
              const previous = index > 0 ? days[index - 1] : undefined;
              const monthLabel =
                index === 0 ||
                (previous && dayParts(previous.date).month !== parts.month)
                  ? `${parts.month}月`
                  : null;
              return (
                <li key={day.date} className="flex flex-col">
                  {monthLabel ? (
                    <p className="section-label m-0 border-b border-[var(--hairline)] pt-3 pb-1">
                      {monthLabel}
                    </p>
                  ) : null}
                  <DailyRow
                    day={day}
                    parts={parts}
                    tempScale={tempScale}
                    humScale={humScale}
                    strongRule={(index + 1) % 7 === 0}
                  />
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}

function Ruler({
  scale,
  unit,
}: {
  scale: RangeScale;
  unit: string;
}): ReactElement {
  return (
    <div aria-hidden="true" className="relative h-5">
      {scale.ticks.map((tick) => (
        <span
          key={tick}
          className="absolute -translate-x-1/2 text-[0.625rem] text-[var(--ink-muted)] tabular-nums"
          style={{ left: `${scalePosition(scale, tick)}%` }}
        >
          {tick}
          {unit}
        </span>
      ))}
    </div>
  );
}

function DailyRow({
  day,
  parts,
  tempScale,
  humScale,
  strongRule,
}: {
  day: DailySummaryViewModel;
  parts: { day: string; weekday: string };
  tempScale: RangeScale | null;
  humScale: RangeScale | null;
  strongRule: boolean;
}): ReactElement {
  const dimmed = day.gapMinutes > 0;
  return (
    <div
      className={`daily-grid grid items-center border-b py-1 min-[900px]:py-0 ${
        strongRule
          ? "border-[var(--hairline-strong)]"
          : "border-[var(--hairline)]"
      }`}
    >
      <p className="m-0 text-[0.8125rem] whitespace-nowrap text-[var(--ink)]">
        <span className="inline-block w-6 text-right font-medium tabular-nums">
          {parts.day}
        </span>
        <span className="ml-1.5 text-[0.6875rem] text-[var(--ink-muted)]">
          {parts.weekday}
        </span>
      </p>
      <MetricCell
        metric={day.temperature}
        scale={tempScale}
        color="var(--temperature)"
        digits={1}
        dimmed={dimmed}
      />
      <MetricNumbers metric={day.temperature} digits={1} />
      <MetricCell
        metric={day.humidity}
        scale={humScale}
        color="var(--humidity)"
        digits={0}
        dimmed={dimmed}
      />
      <div className="flex items-center justify-end gap-3">
        <MetricNumbers metric={day.humidity} digits={0} />
        {day.gapMinutes > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-[0.6875rem] font-medium whitespace-nowrap text-[var(--warning)]">
            <WarningIcon className="shrink-0" />
            欠測 {day.gapMinutes}分
          </span>
        ) : null}
      </div>
    </div>
  );
}

function MetricCell({
  metric,
  scale,
  color,
  digits,
  dimmed,
}: {
  metric: DailyMetricViewModel | null;
  scale: RangeScale | null;
  color: string;
  digits: number;
  dimmed: boolean;
}): ReactElement {
  if (!metric || !scale || metric.minimum === null || metric.maximum === null) {
    return (
      <div className="flex h-8 items-center text-[var(--ink-muted)]">—</div>
    );
  }
  const left = scalePosition(scale, metric.minimum);
  const width = Math.max(0.8, scalePosition(scale, metric.maximum) - left);
  const average = metric.average;
  const label = `最低 ${metric.minimum.toFixed(digits)}、平均 ${
    average === null ? "不明" : average.toFixed(digits)
  }、最高 ${metric.maximum.toFixed(digits)}`;
  return (
    <div
      role="img"
      aria-label={label}
      className={`relative h-8 ${dimmed ? "opacity-60" : ""}`}
    >
      {scale.ticks.map((tick) => (
        <span
          key={tick}
          aria-hidden="true"
          className="absolute top-1 bottom-1 w-px bg-[var(--hairline)] opacity-60"
          style={{ left: `${scalePosition(scale, tick)}%` }}
        />
      ))}
      <span
        aria-hidden="true"
        className="absolute top-1/2 h-[6px] -translate-y-1/2 rounded-full"
        style={{
          left: `${left}%`,
          width: `${width}%`,
          backgroundColor: color,
          opacity: 0.85,
        }}
      />
      {average !== null ? (
        <span
          aria-hidden="true"
          className="absolute top-1/2 h-[14px] w-[2px] -translate-x-1/2 -translate-y-1/2 bg-[var(--gold)]"
          style={{ left: `${scalePosition(scale, average)}%` }}
        />
      ) : null}
    </div>
  );
}

function MetricNumbers({
  metric,
  digits,
}: {
  metric: DailyMetricViewModel | null;
  digits: number;
}): ReactElement {
  if (!metric) {
    return <p className="m-0 text-[0.75rem] text-[var(--ink-muted)]">--</p>;
  }
  const format = (value: number | null): string =>
    value === null ? "--" : value.toFixed(digits);
  return (
    <p className="m-0 text-[0.75rem] whitespace-nowrap text-[var(--ink-secondary)] tabular-nums">
      <span className="hidden min-[900px]:inline">
        {format(metric.minimum)} /{" "}
        <span className="font-medium text-[var(--ink)]">
          {format(metric.average)}
        </span>{" "}
        / {format(metric.maximum)}
      </span>
      <span className="min-[900px]:hidden">
        {format(metric.minimum)}–{format(metric.maximum)}
      </span>
    </p>
  );
}
