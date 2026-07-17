import { describe, expect, it } from "vitest";

import {
  aggregateEnvironmentSeriesFixture,
  fixtureScenarios,
  FIXTURE_NOW,
} from "@/test/fixtures";
import { mapDashboard, mapEnvironmentSeries, mapWarnings } from "./map";

const now = new Date(FIXTURE_NOW);

describe("view model mapping", () => {
  it("formats values and timestamps in Asia/Tokyo", () => {
    const fixture = fixtureScenarios.normal;
    const model = mapDashboard(
      {
        status: fixture.status.data,
        current: fixture.current.data,
        environmentSeries: fixture.environmentSeries.data,
        airconSeries: fixture.airconSeries.data,
        dailySummary: fixture.dailySummary.data,
      },
      now,
    );

    expect(model.environment?.temperature.displayValue).toBe("26.4");
    expect(model.environment?.humidity.displayValue).toBe("58");
    expect(model.environment?.temperature.observedAt?.label).toContain("21:31");
    expect(model.aircon?.recognitionLabel).toBe("運転中");
    expect(model.aircon?.heading).toContain("Nature Remo認識状態");
    expect(model.aircon?.disclaimer).toContain("双方向確認ではありません");
  });

  it("keeps missing values null and displays placeholders without guessing", () => {
    const fixture = fixtureScenarios.normal;
    const current = {
      ...fixture.current.data,
      environment: fixture.current.data.environment
        ? {
            ...fixture.current.data.environment,
            temperature: { valueC: null, observedAt: null, stale: true },
            humidity: { valuePct: null, observedAt: null, stale: true },
          }
        : null,
    };
    const model = mapDashboard({ status: fixture.status.data, current }, now);
    expect(model.environment?.temperature).toMatchObject({
      value: null,
      displayValue: "--",
      observedAt: null,
    });
    expect(model.environment?.humidity).toMatchObject({
      value: null,
      displayValue: "--",
      observedAt: null,
    });
  });

  it("orders semantic warnings according to the design specification", () => {
    const fixture = fixtureScenarios.normal;
    const warnings = mapWarnings(
      {
        ...fixture.status.data,
        collectionState: "stopped",
        lastRun: fixture.status.data.lastRun
          ? { ...fixture.status.data.lastRun, overallStatus: "partial" }
          : null,
      },
      {
        ...fixture.current.data,
        freshness: {
          ...fixture.current.data.freshness,
          collectionStopped: true,
        },
        environment: fixture.current.data.environment
          ? {
              ...fixture.current.data.environment,
              remoOnline: false,
              temperature: {
                ...fixture.current.data.environment.temperature,
                stale: true,
              },
              humidity: {
                ...fixture.current.data.environment.humidity,
                stale: true,
              },
            }
          : null,
        aircon: fixture.current.data.aircon
          ? { ...fixture.current.data.aircon, recognitionState: "unknown" }
          : null,
      },
    );
    expect(warnings.map((warning) => warning.code)).toEqual([
      "collectionStopped",
      "remoOffline",
      "partialFailure",
      "temperatureStale",
      "humidityStale",
      "airconUnknown",
    ]);
  });

  it.each(["initializing", "noData"] as const)(
    "does not report stopped or unknown while the %s state has no samples",
    (scenarioName) => {
      const fixture = fixtureScenarios[scenarioName];
      const warnings = mapWarnings(fixture.status.data, fixture.current.data);

      expect(warnings.map((warning) => warning.code)).not.toContain(
        "collectionStopped",
      );
      expect(warnings.map((warning) => warning.code)).not.toContain(
        "airconUnknown",
      );
    },
  );

  it("does not describe full errors or cancellations as partial success", () => {
    const fullError = fixtureScenarios.fullError;
    expect(
      mapWarnings(fullError.status.data, fullError.current.data).map(
        (warning) => warning.code,
      ),
    ).not.toContain("partialFailure");

    const cancelledStatus = {
      ...fullError.status.data,
      lastRun: fullError.status.data.lastRun
        ? {
            ...fullError.status.data.lastRun,
            overallStatus: "cancelled" as const,
            devicesStatus: "error" as const,
            appliancesStatus: "error" as const,
          }
        : null,
    };
    expect(
      mapWarnings(cancelledStatus, fullError.current.data).map(
        (warning) => warning.code,
      ),
    ).not.toContain("partialFailure");
  });

  it("preserves unknown aircon mode raw value", () => {
    const fixture = fixtureScenarios.unknownAirconMode;
    const model = mapDashboard(
      { status: fixture.status.data, current: fixture.current.data },
      now,
    );
    expect(model.aircon?.mode).toEqual({
      raw: "vendor-eco-plus",
      label: "vendor-eco-plus",
      known: false,
    });
  });

  it("keeps raw gaps null and maps aggregate averages without interpolation", () => {
    const raw = fixtureScenarios.normal.environmentSeries.data;
    if (raw.resolution !== "raw") throw new Error("fixture must be raw");
    const rawModel = mapEnvironmentSeries(raw, now);
    expect(rawModel.points[1]).toMatchObject({
      gap: true,
      stale: true,
      temperature: { value: null },
      humidity: { value: null },
    });

    const aggregate = aggregateEnvironmentSeriesFixture.data;
    const aggregateModel = mapEnvironmentSeries(aggregate, now);
    expect(aggregateModel.points[0]?.temperature).toMatchObject({
      value: 26.2,
      minimum: 26,
      maximum: 26.4,
      sampleCount: 3,
    });
  });
});
