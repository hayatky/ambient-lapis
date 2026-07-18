import type { ReactElement } from "react";

import type { SeriesSummary } from "@/lib/chart/option";

interface ChartSummaryProps {
  summary: SeriesSummary;
}

// Text alternative for the chart: minimum, maximum and latest values in
// the displayed range, reachable by keyboard.
export function ChartSummary({ summary }: ChartSummaryProps): ReactElement {
  return (
    <div
      tabIndex={0}
      aria-label="グラフのテキスト要約"
      className="border-t border-[var(--hairline)] pt-2 text-[0.8125rem] leading-relaxed text-[var(--ink-secondary)]"
    >
      {summary.temperature ? (
        <p className="m-0">
          温度: 最低 {summary.temperature.minimum.toFixed(1)}°C ・ 最高{" "}
          {summary.temperature.maximum.toFixed(1)}°C ・ 最新{" "}
          {summary.temperature.latest.toFixed(1)}°C(
          {summary.temperature.latestAt})
        </p>
      ) : (
        <p className="m-0">温度: この期間に有効な値はありません</p>
      )}
      {summary.humidity ? (
        <p className="m-0">
          湿度: 最低 {summary.humidity.minimum.toFixed(0)}% ・ 最高{" "}
          {summary.humidity.maximum.toFixed(0)}% ・ 最新{" "}
          {summary.humidity.latest.toFixed(0)}%({summary.humidity.latestAt})
        </p>
      ) : (
        <p className="m-0">湿度: この期間に有効な値はありません</p>
      )}
    </div>
  );
}
