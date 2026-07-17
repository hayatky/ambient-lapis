import type { ReactElement } from "react";

import { Dashboard } from "@/components/dashboard/dashboard";
import type { DashboardInitialData } from "@/hooks/use-dashboard-data";
import { serverApi } from "@/lib/api/server-client";
import { resolvePresetPeriod } from "@/lib/period";

export const dynamic = "force-dynamic";

function fulfilled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

// Initial render fetches everything on the server (§9.1): status, current
// values, the last 24 hours of history and the daily summary. Failures
// never prevent the page shell from rendering; the client retries.
export default async function HomePage(): Promise<ReactElement> {
  const now = new Date();
  const period = resolvePresetPeriod("24h", now);
  const seriesQuery = {
    from: period.series.fromIso,
    to: period.series.toIso,
  };

  const [status, current, environmentSeries, airconSeries, dailySummary] =
    await Promise.allSettled([
      serverApi.status(),
      serverApi.current(),
      serverApi.environmentSeries({ ...seriesQuery, resolution: "auto" }),
      serverApi.airconSeries(seriesQuery),
      serverApi.dailySummary({
        from: period.dailySummary.fromIso,
        to: period.dailySummary.toIso,
      }),
    ]);

  const initial: DashboardInitialData = {
    status: fulfilled(status)?.data ?? null,
    current: fulfilled(current)?.data ?? null,
    currentFailed:
      status.status === "rejected" || current.status === "rejected",
    environmentSeries: fulfilled(environmentSeries)?.data ?? null,
    airconSeries: fulfilled(airconSeries)?.data ?? null,
    dailySummary: fulfilled(dailySummary)?.data ?? null,
    historyFailed:
      environmentSeries.status === "rejected" ||
      airconSeries.status === "rejected" ||
      dailySummary.status === "rejected",
  };

  return <Dashboard initial={initial} serverNowIso={now.toISOString()} />;
}
