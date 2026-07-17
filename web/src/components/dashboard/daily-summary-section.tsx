import type { ReactElement } from "react";

import type {
  DailyMetricViewModel,
  DailySummaryViewModel,
} from "@/lib/view-model";

import { WarningIcon } from "./icons";

const MISSING = "--";

function formatMetric(value: number | null, digits: number): string {
  return value === null ? MISSING : value.toFixed(digits);
}

interface DailySummarySectionProps {
  days: DailySummaryViewModel[];
}

// Daily minimum / average / maximum, newest first. Mobile shows one card
// per day; wider screens show comparable rows sharing one header.
export function DailySummarySection({
  days,
}: DailySummarySectionProps): ReactElement {
  return (
    <section
      aria-label="日次サマリー"
      className="surface-card flex flex-col gap-5 p-6"
    >
      <header className="flex flex-col gap-0.5">
        <h2 className="m-0 text-base font-semibold text-[var(--text-primary)]">
          日ごとの記録
        </h2>
        <p className="m-0 text-[0.8125rem] text-[var(--text-secondary)]">
          温度と湿度の最低 / 平均 / 最高
        </p>
      </header>
      {days.length === 0 ? (
        <p className="m-0 text-[0.9375rem] text-[var(--text-secondary)]">
          日次サマリーはまだありません。
        </p>
      ) : (
        <>
          {/* Mobile: one card per day */}
          <ul className="m-0 flex list-none flex-col gap-3 p-0 md:hidden">
            {days.map((day) => (
              <li
                key={day.date}
                className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="m-0 text-[0.9375rem] font-medium text-[var(--text-primary)]">
                    {day.dateLabel}
                  </p>
                  <GapNote gapMinutes={day.gapMinutes} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <DailyMetricBlock
                    name="温度"
                    unit="°C"
                    color="var(--temperature)"
                    metric={day.temperature}
                    digits={1}
                  />
                  <DailyMetricBlock
                    name="湿度"
                    unit="%"
                    color="var(--humidity)"
                    metric={day.humidity}
                    digits={0}
                  />
                </div>
              </li>
            ))}
          </ul>
          {/* Tablet / PC: comparable rows */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-[0.9375rem]">
              <thead>
                <tr className="text-left text-xs text-[var(--text-secondary)]">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    日付
                  </th>
                  <th
                    scope="col"
                    colSpan={3}
                    className="border-b-2 py-2 pr-6 font-medium"
                    style={{ borderBottomColor: "var(--temperature)" }}
                  >
                    温度 (°C) 最低 / 平均 / 最高
                  </th>
                  <th
                    scope="col"
                    colSpan={3}
                    className="border-b-2 py-2 pr-6 font-medium"
                    style={{ borderBottomColor: "var(--humidity)" }}
                  >
                    湿度 (%) 最低 / 平均 / 最高
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    欠損
                  </th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => (
                  <tr
                    key={day.date}
                    className="border-t border-[var(--border-subtle)] text-[var(--text-primary)]"
                  >
                    <th
                      scope="row"
                      className="py-2.5 pr-4 text-left font-normal whitespace-nowrap"
                    >
                      {day.dateLabel}
                    </th>
                    <MetricCells metric={day.temperature} digits={1} />
                    <MetricCells metric={day.humidity} digits={0} />
                    <td className="py-2.5 whitespace-nowrap">
                      <GapNote gapMinutes={day.gapMinutes} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function MetricCells({
  metric,
  digits,
}: {
  metric: DailyMetricViewModel | null;
  digits: number;
}): ReactElement {
  return (
    <>
      <td className="py-2.5 pr-3 tabular-nums">
        {formatMetric(metric?.minimum ?? null, digits)}
      </td>
      <td className="py-2.5 pr-3 font-medium tabular-nums">
        {formatMetric(metric?.average ?? null, digits)}
      </td>
      <td className="py-2.5 pr-6 tabular-nums">
        {formatMetric(metric?.maximum ?? null, digits)}
      </td>
    </>
  );
}

function DailyMetricBlock({
  name,
  unit,
  color,
  metric,
  digits,
}: {
  name: string;
  unit: string;
  color: string;
  metric: DailyMetricViewModel | null;
  digits: number;
}): ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <p className="m-0 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
        <span
          aria-hidden="true"
          className="h-[3px] w-3 rounded-full"
          style={{ backgroundColor: color }}
        />
        {name} ({unit})
      </p>
      <p className="m-0 text-[var(--text-primary)] tabular-nums">
        {formatMetric(metric?.minimum ?? null, digits)}
        <span className="mx-1 text-[var(--text-secondary)]">/</span>
        <span className="font-medium">
          {formatMetric(metric?.average ?? null, digits)}
        </span>
        <span className="mx-1 text-[var(--text-secondary)]">/</span>
        {formatMetric(metric?.maximum ?? null, digits)}
      </p>
    </div>
  );
}

function GapNote({ gapMinutes }: { gapMinutes: number }): ReactElement {
  if (gapMinutes === 0) {
    return (
      <span className="text-xs text-[var(--text-secondary)]">欠損なし</span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--warning)]">
      <WarningIcon className="shrink-0" />
      欠損 {gapMinutes}分
    </span>
  );
}
