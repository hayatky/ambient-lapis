import type {
  AirconSeriesResponse,
  ApiFailure,
  CurrentData,
  CurrentResponse,
  DailySummaryResponse,
  EnvironmentSeriesResponse,
  StatusData,
  StatusResponse,
} from "@/lib/api";

export const FIXTURE_NOW = "2026-07-18T12:35:00.000Z";

const currentMeta = {
  requestId: "fixture-request-0001",
  generatedAt: FIXTURE_NOW,
  timezone: "Asia/Tokyo",
} as const;

const environmentSeriesMeta = {
  ...currentMeta,
  from: "2026-07-18T12:00:00.000Z",
  to: "2026-07-18T13:00:00.000Z",
  limit: 10_000,
  truncated: false,
} as const;

const historyMeta = {
  ...currentMeta,
  limit: 10_000,
  truncated: false,
} as const;

function success<T, M extends { requestId: string; generatedAt: string }>(
  data: T,
  meta: M,
): { data: T; meta: M } {
  return { data, meta };
}

const healthyStatus: StatusData = {
  collectionState: "healthy",
  lastFullSuccessAt: "2026-07-18T12:33:01.200Z",
  lastEnvironmentSuccessAt: "2026-07-18T12:33:00.000Z",
  lastAirconSuccessAt: "2026-07-18T12:33:01.000Z",
  lastRun: {
    startedAt: "2026-07-18T12:33:00.000Z",
    completedAt: "2026-07-18T12:33:01.200Z",
    overallStatus: "success",
    devicesStatus: "success",
    appliancesStatus: "success",
    errorCodes: [],
  },
  pollIntervalSeconds: 300,
  staleAfterSeconds: 600,
};

const normalEnvironment: NonNullable<CurrentData["environment"]> = {
  fetchedAt: "2026-07-18T12:33:00.000Z",
  remoOnline: true,
  temperature: {
    valueC: 26.4,
    observedAt: "2026-07-18T12:31:42.000Z",
    stale: false,
  },
  humidity: {
    valuePct: 58,
    observedAt: "2026-07-18T12:31:45.000Z",
    stale: false,
  },
};

const normalAircon: NonNullable<CurrentData["aircon"]> = {
  fetchedAt: "2026-07-18T12:33:01.000Z",
  recognitionState: "on",
  mode: { raw: "cool", label: "冷房", known: true },
  targetTemperatureC: 26,
  volume: "auto",
  directionVertical: "auto",
  directionHorizontal: null,
  settingsUpdatedAt: "2026-07-18T11:55:00.000Z",
};

const normalCurrent: CurrentData = {
  environment: normalEnvironment,
  aircon: normalAircon,
  freshness: {
    collectionStopped: false,
    lastFullSuccessAt: "2026-07-18T12:33:01.200Z",
  },
};

export const rawEnvironmentSeriesFixture: EnvironmentSeriesResponse = success(
  {
    resolution: "raw",
    points: [
      {
        time: "2026-07-18T12:25:00.000Z",
        temperature: { value: 26.1, observedAt: "2026-07-18T12:24:40.000Z" },
        humidity: { value: 57, observedAt: "2026-07-18T12:24:42.000Z" },
        remoOnlineState: "online",
        gap: false,
        stale: false,
      },
      {
        time: "2026-07-18T12:30:00.000Z",
        temperature: { value: null, observedAt: null },
        humidity: { value: null, observedAt: null },
        remoOnlineState: "unknown",
        gap: true,
        stale: true,
      },
    ],
  },
  environmentSeriesMeta,
);

export const aggregateEnvironmentSeriesFixture: EnvironmentSeriesResponse =
  success(
    {
      resolution: "15m",
      points: [
        {
          time: "2026-07-18T12:00:00.000Z",
          temperature: {
            avg: 26.2,
            min: 26,
            max: 26.4,
            sampleCount: 3,
            latestObservedAt: "2026-07-18T12:13:40.000Z",
          },
          humidity: {
            avg: 57.6,
            min: 57,
            max: 58,
            sampleCount: 3,
            latestObservedAt: "2026-07-18T12:13:42.000Z",
          },
          remoOnlineState: "mixed",
          gap: false,
          stale: false,
        },
      ],
    },
    environmentSeriesMeta,
  );

const airconSeries: AirconSeriesResponse = success(
  {
    segments: [
      {
        from: "2026-07-18T12:00:00.000Z",
        to: "2026-07-18T12:30:00.000Z",
        state: "on",
        mode: "cool",
        targetTemperatureC: 26,
      },
      {
        from: "2026-07-18T12:30:00.000Z",
        to: "2026-07-18T12:35:00.000Z",
        state: "gap",
        mode: null,
        targetTemperatureC: null,
      },
    ],
  },
  historyMeta,
);

const dailySummary: DailySummaryResponse = success(
  {
    days: [
      {
        date: "2026-07-18",
        temperature: { avg: 26.3, min: 24.8, max: 28.1, sampleCount: 144 },
        humidity: { avg: 57.2, min: 51, max: 63, sampleCount: 144 },
        gapMinutes: 12,
      },
    ],
  },
  historyMeta,
);

export const apiErrorFixture: ApiFailure = {
  error: {
    code: "upstream_unavailable",
    message: "内部APIへ接続できませんでした",
  },
  meta: {
    requestId: "fixture-error-0001",
    generatedAt: FIXTURE_NOW,
  },
};

export interface FixtureScenario {
  status: StatusResponse;
  current: CurrentResponse;
  environmentSeries: EnvironmentSeriesResponse;
  airconSeries: AirconSeriesResponse;
  dailySummary: DailySummaryResponse;
  error: ApiFailure;
}

function scenario(status: StatusData, current: CurrentData): FixtureScenario {
  return {
    status: success(status, currentMeta),
    current: success(current, currentMeta),
    environmentSeries: rawEnvironmentSeriesFixture,
    airconSeries,
    dailySummary,
    error: apiErrorFixture,
  };
}

export const fixtureScenarios = {
  normal: scenario(healthyStatus, normalCurrent),
  initializing: scenario(
    {
      ...healthyStatus,
      collectionState: "initializing",
      lastFullSuccessAt: null,
      lastEnvironmentSuccessAt: null,
      lastAirconSuccessAt: null,
      lastRun: null,
    },
    {
      environment: null,
      aircon: null,
      freshness: { collectionStopped: true, lastFullSuccessAt: null },
    },
  ),
  noData: scenario(healthyStatus, {
    environment: null,
    aircon: null,
    freshness: {
      collectionStopped: false,
      lastFullSuccessAt: healthyStatus.lastFullSuccessAt,
    },
  }),
  partialEnvironmentOnly: scenario(
    {
      ...healthyStatus,
      collectionState: "degraded",
      lastRun: {
        startedAt: "2026-07-18T12:33:00.000Z",
        completedAt: "2026-07-18T12:33:01.200Z",
        overallStatus: "partial",
        devicesStatus: "success",
        appliancesStatus: "error",
        errorCodes: ["upstream_error"],
      },
    },
    { ...normalCurrent, aircon: null },
  ),
  partialAirconOnly: scenario(
    {
      ...healthyStatus,
      collectionState: "degraded",
      lastRun: {
        startedAt: "2026-07-18T12:33:00.000Z",
        completedAt: "2026-07-18T12:33:01.200Z",
        overallStatus: "partial",
        devicesStatus: "error",
        appliancesStatus: "success",
        errorCodes: ["timeout"],
      },
    },
    { ...normalCurrent, environment: null },
  ),
  collectionStopped: scenario(
    { ...healthyStatus, collectionState: "stopped" },
    {
      ...normalCurrent,
      freshness: { ...normalCurrent.freshness, collectionStopped: true },
    },
  ),
  remoOffline: scenario(healthyStatus, {
    ...normalCurrent,
    environment: { ...normalEnvironment, remoOnline: false },
  }),
  temperatureStale: scenario(healthyStatus, {
    ...normalCurrent,
    environment: {
      ...normalEnvironment,
      temperature: { ...normalEnvironment.temperature, stale: true },
    },
  }),
  humidityStale: scenario(healthyStatus, {
    ...normalCurrent,
    environment: {
      ...normalEnvironment,
      humidity: { ...normalEnvironment.humidity, stale: true },
    },
  }),
  airconUnknown: scenario(healthyStatus, {
    ...normalCurrent,
    aircon: {
      ...normalAircon,
      recognitionState: "unknown",
    },
  }),
  unknownAirconMode: scenario(healthyStatus, {
    ...normalCurrent,
    aircon: {
      ...normalAircon,
      mode: { raw: "vendor-eco-plus", label: "vendor-eco-plus", known: false },
    },
  }),
  fullError: scenario(
    {
      ...healthyStatus,
      collectionState: "degraded",
      lastRun: {
        startedAt: "2026-07-18T12:33:00.000Z",
        completedAt: "2026-07-18T12:33:01.200Z",
        overallStatus: "error",
        devicesStatus: "error",
        appliancesStatus: "error",
        errorCodes: ["timeout", "upstream_error"],
      },
    },
    normalCurrent,
  ),
} satisfies Record<string, FixtureScenario>;

export const invalidContractFixtures: Record<string, unknown> = {
  missingRequiredField: {
    data: { collectionState: "healthy" },
    meta: currentMeta,
  },
  wrongValueType: {
    data: { ...healthyStatus, pollIntervalSeconds: "300" },
    meta: currentMeta,
  },
  invalidTimestamp: {
    data: { ...healthyStatus, lastFullSuccessAt: "yesterday" },
    meta: currentMeta,
  },
  unknownContractEnum: {
    data: { ...healthyStatus, collectionState: "paused" },
    meta: currentMeta,
  },
  mixedRawAndAggregate: {
    data: {
      resolution: "raw",
      points: aggregateEnvironmentSeriesFixture.data.points,
    },
    meta: environmentSeriesMeta,
  },
};
