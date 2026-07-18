import type { AmbientLapisApi } from "../api";
import { dailySummaryRange, historyRangeForPreset } from "./range";
import { settledResource } from "./resource";
import type { DashboardInitialData } from "./types";

/**
 * Loads each dashboard resource independently so an unavailable endpoint never
 * prevents the server component from returning the application shell.
 */
export async function loadDashboardInitialData(
  api: AmbientLapisApi,
  now: Date = new Date(),
): Promise<DashboardInitialData> {
  const historyRange = historyRangeForPreset("24h", now);
  const dailyRange = dailySummaryRange(now);

  const results = await Promise.allSettled([
    Promise.resolve().then(() => api.status()),
    Promise.resolve().then(() => api.current()),
    Promise.resolve().then(() =>
      api.environmentSeries({
        from: historyRange.from,
        to: historyRange.to,
        resolution: "auto",
      }),
    ),
    Promise.resolve().then(() => api.airconSeries(historyRange)),
    Promise.resolve().then(() => api.dailySummary(dailyRange)),
  ] as const);

  return {
    loadedAt: now.toISOString(),
    historyRange,
    dailyRange,
    resources: {
      status: settledResource(results[0]),
      current: settledResource(results[1]),
      environmentSeries: settledResource(results[2]),
      airconSeries: settledResource(results[3]),
      dailySummary: settledResource(results[4]),
    },
  };
}
