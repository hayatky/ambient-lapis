import type { EnvironmentSeriesViewModel } from "@/lib/view-model";

import type { HistoryChartSummary, MetricSummary } from "./types";

type MetricName = "temperature" | "humidity";

const EMPTY_SUMMARY: MetricSummary = {
  minimum: null,
  maximum: null,
  latest: null,
};

export function buildHistoryChartSummary(
  series: EnvironmentSeriesViewModel,
): HistoryChartSummary {
  return {
    temperature: summarizeMetric(series, "temperature"),
    humidity: summarizeMetric(series, "humidity"),
  };
}

function summarizeMetric(
  series: EnvironmentSeriesViewModel,
  metricName: MetricName,
): MetricSummary {
  let minimum: number | null = null;
  let maximum: number | null = null;
  let latest: { epochMs: number; value: number } | null = null;

  for (const point of series.points) {
    if (point.gap) continue;

    const metric = point[metricName];
    const pointMinimum = metric.minimum ?? metric.value;
    const pointMaximum = metric.maximum ?? metric.value;

    if (pointMinimum !== null) {
      minimum =
        minimum === null ? pointMinimum : Math.min(minimum, pointMinimum);
    }
    if (pointMaximum !== null) {
      maximum =
        maximum === null ? pointMaximum : Math.max(maximum, pointMaximum);
    }
    if (
      metric.value !== null &&
      (latest === null || point.time.epochMs > latest.epochMs)
    ) {
      latest = { epochMs: point.time.epochMs, value: metric.value };
    }
  }

  if (minimum === null && maximum === null && latest === null) {
    return EMPTY_SUMMARY;
  }

  return { minimum, maximum, latest: latest?.value ?? null };
}
