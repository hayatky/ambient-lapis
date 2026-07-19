import type { ReactElement } from "react";

import { Simple } from "@/components/simple/simple";
import type { SimpleInitialData } from "@/hooks/use-simple-data";
import { serverApi } from "@/lib/api/server-client";
import { resolvePresetPeriod } from "@/lib/period";

export const dynamic = "force-dynamic";

function fulfilled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === "fulfilled" ? result.value : null;
}

export default async function SimplePage(): Promise<ReactElement> {
  const now = new Date();
  const period = resolvePresetPeriod("24h", now);
  const query = { from: period.series.fromIso, to: period.series.toIso };
  const [status, current, environmentSeries, airconSeries] =
    await Promise.allSettled([
      serverApi.status(),
      serverApi.current(),
      serverApi.environmentSeries({ ...query, resolution: "auto" }),
      serverApi.airconSeries(query),
    ]);
  const initial: SimpleInitialData = {
    status: fulfilled(status)?.data ?? null,
    current: fulfilled(current)?.data ?? null,
    currentFailed:
      status.status === "rejected" || current.status === "rejected",
    environmentSeries: fulfilled(environmentSeries)?.data ?? null,
    airconSeries: fulfilled(airconSeries)?.data ?? null,
    historyFailed:
      environmentSeries.status === "rejected" ||
      airconSeries.status === "rejected",
  };
  return <Simple initial={initial} serverNowIso={now.toISOString()} />;
}
