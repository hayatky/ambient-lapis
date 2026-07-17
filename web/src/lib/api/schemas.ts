import { z } from "zod";

const finiteNumber = z.number().finite();
const nonNegativeInteger = z.number().int().nonnegative();
const rfc3339 = z.string().datetime({ offset: true });
const nullableTimestamp = rfc3339.nullable();

export const responseMetaSchema = z.looseObject({
  requestId: z.string().min(1),
  generatedAt: rfc3339,
});

export const currentResponseMetaSchema = z.looseObject({
  requestId: z.string().min(1),
  generatedAt: rfc3339,
  timezone: z.string().min(1),
});

export const environmentSeriesResponseMetaSchema = z.looseObject({
  requestId: z.string().min(1),
  generatedAt: rfc3339,
  timezone: z.string().min(1),
  from: rfc3339,
  to: rfc3339,
  limit: nonNegativeInteger,
  truncated: z.boolean(),
});

export const historyResponseMetaSchema = z.looseObject({
  requestId: z.string().min(1),
  generatedAt: rfc3339,
  timezone: z.string().min(1),
  limit: nonNegativeInteger,
  truncated: z.boolean(),
});

export const apiErrorBodySchema = z.looseObject({
  code: z.string().min(1),
  message: z.string(),
  field: z.string().min(1).optional(),
});

export const apiFailureSchema = z.looseObject({
  error: apiErrorBodySchema,
  meta: responseMetaSchema,
});

export const successSchema = <T extends z.ZodType, M extends z.ZodType>(
  data: T,
  meta: M,
) => z.looseObject({ data, meta });

export const lastRunSchema = z.looseObject({
  startedAt: rfc3339,
  completedAt: nullableTimestamp,
  overallStatus: z.enum([
    "running",
    "success",
    "partial",
    "error",
    "cancelled",
  ]),
  devicesStatus: z.enum(["pending", "success", "error", "skipped"]),
  appliancesStatus: z.enum(["pending", "success", "error", "skipped"]),
  errorCodes: z.array(z.string()),
});

export const statusDataSchema = z.looseObject({
  collectionState: z.enum(["initializing", "healthy", "degraded", "stopped"]),
  lastFullSuccessAt: nullableTimestamp,
  lastEnvironmentSuccessAt: nullableTimestamp,
  lastAirconSuccessAt: nullableTimestamp,
  lastRun: lastRunSchema.nullable(),
  pollIntervalSeconds: nonNegativeInteger,
  staleAfterSeconds: nonNegativeInteger,
});
export const statusResponseSchema = successSchema(
  statusDataSchema,
  currentResponseMetaSchema,
);

const temperatureSchema = z.looseObject({
  valueC: finiteNumber.nullable(),
  observedAt: nullableTimestamp,
  stale: z.boolean(),
});

const humiditySchema = z.looseObject({
  valuePct: finiteNumber.nullable(),
  observedAt: nullableTimestamp,
  stale: z.boolean(),
});

export const currentEnvironmentSchema = z.looseObject({
  fetchedAt: rfc3339,
  remoOnline: z.boolean().nullable(),
  temperature: temperatureSchema,
  humidity: humiditySchema,
});

export const modeSchema = z.looseObject({
  raw: z.string(),
  label: z.string(),
  known: z.boolean(),
});

export const currentAirconSchema = z.looseObject({
  fetchedAt: rfc3339,
  recognitionState: z.enum(["on", "off", "unknown"]),
  mode: modeSchema,
  targetTemperatureC: finiteNumber.nullable(),
  volume: z.string().nullable(),
  directionVertical: z.string().nullable(),
  directionHorizontal: z.string().nullable(),
  settingsUpdatedAt: nullableTimestamp,
});

export const currentDataSchema = z.looseObject({
  environment: currentEnvironmentSchema.nullable(),
  aircon: currentAirconSchema.nullable(),
  freshness: z.looseObject({
    collectionStopped: z.boolean(),
    lastFullSuccessAt: nullableTimestamp,
  }),
});
export const currentResponseSchema = successSchema(
  currentDataSchema,
  currentResponseMetaSchema,
);

export const rawSeriesMetricSchema = z.looseObject({
  value: finiteNumber.nullable(),
  observedAt: nullableTimestamp,
});

export const aggregateSeriesMetricSchema = z.looseObject({
  avg: finiteNumber.nullable(),
  min: finiteNumber.nullable(),
  max: finiteNumber.nullable(),
  sampleCount: nonNegativeInteger,
  latestObservedAt: nullableTimestamp,
});

const seriesPointBase = {
  time: rfc3339,
  remoOnlineState: z.enum(["online", "offline", "mixed", "unknown"]),
  gap: z.boolean(),
  stale: z.boolean(),
};

export const rawEnvironmentPointSchema = z.looseObject({
  ...seriesPointBase,
  temperature: rawSeriesMetricSchema,
  humidity: rawSeriesMetricSchema,
});

export const aggregateEnvironmentPointSchema = z.looseObject({
  ...seriesPointBase,
  temperature: aggregateSeriesMetricSchema,
  humidity: aggregateSeriesMetricSchema,
});

const rawEnvironmentSeriesDataSchema = z.looseObject({
  resolution: z.literal("raw"),
  points: z.array(rawEnvironmentPointSchema),
});

const aggregateEnvironmentSeriesDataSchema = z.looseObject({
  resolution: z.enum(["15m", "1h", "1d"]),
  points: z.array(aggregateEnvironmentPointSchema),
});

export const environmentSeriesDataSchema = z.discriminatedUnion("resolution", [
  rawEnvironmentSeriesDataSchema,
  aggregateEnvironmentSeriesDataSchema,
]);
export const environmentSeriesResponseSchema = successSchema(
  environmentSeriesDataSchema,
  environmentSeriesResponseMetaSchema,
);

export const airconSegmentSchema = z.looseObject({
  from: rfc3339,
  to: rfc3339,
  state: z.enum(["on", "off", "unknown", "gap"]),
  mode: z.string().nullable(),
  targetTemperatureC: finiteNumber.nullable(),
});
export const airconSeriesDataSchema = z.looseObject({
  segments: z.array(airconSegmentSchema),
});
export const airconSeriesResponseSchema = successSchema(
  airconSeriesDataSchema,
  historyResponseMetaSchema,
);

export const dailySummaryMetricSchema = z.looseObject({
  avg: finiteNumber.nullable(),
  min: finiteNumber.nullable(),
  max: finiteNumber.nullable(),
  sampleCount: nonNegativeInteger,
});

export const dailySummaryDaySchema = z.looseObject({
  date: z.string().date(),
  temperature: dailySummaryMetricSchema.nullable(),
  humidity: dailySummaryMetricSchema.nullable(),
  gapMinutes: nonNegativeInteger,
});
export const dailySummaryDataSchema = z.looseObject({
  days: z.array(dailySummaryDaySchema),
});
export const dailySummaryResponseSchema = successSchema(
  dailySummaryDataSchema,
  historyResponseMetaSchema,
);

export type ResponseMeta = z.infer<typeof responseMetaSchema>;
export type ApiFailure = z.infer<typeof apiFailureSchema>;
export type ApiSuccess<T> = { data: T; meta: ResponseMeta };
export type StatusData = z.infer<typeof statusDataSchema>;
export type StatusResponse = z.infer<typeof statusResponseSchema>;
export type CurrentData = z.infer<typeof currentDataSchema>;
export type CurrentResponse = z.infer<typeof currentResponseSchema>;
export type RawSeriesMetric = z.infer<typeof rawSeriesMetricSchema>;
export type AggregateSeriesMetric = z.infer<typeof aggregateSeriesMetricSchema>;
export type RawEnvironmentPoint = z.infer<typeof rawEnvironmentPointSchema>;
export type AggregateEnvironmentPoint = z.infer<
  typeof aggregateEnvironmentPointSchema
>;
export type EnvironmentSeriesData = z.infer<typeof environmentSeriesDataSchema>;
export type EnvironmentSeriesResponse = z.infer<
  typeof environmentSeriesResponseSchema
>;
export type AirconSeriesData = z.infer<typeof airconSeriesDataSchema>;
export type AirconSeriesResponse = z.infer<typeof airconSeriesResponseSchema>;
export type DailySummaryData = z.infer<typeof dailySummaryDataSchema>;
export type DailySummaryResponse = z.infer<typeof dailySummaryResponseSchema>;
