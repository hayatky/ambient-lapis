// Deterministic sample-data generator for the mock Go API used by
// local visual verification and E2E tests. All values are fictional.
// The daily rhythm is a smooth summer-room profile with a fixed
// maintenance gap so charts always show an honest broken line.

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const JST_OFFSET_MS = 9 * HOUR_MS;
const RAW_STEP_MS = 5 * MINUTE_MS;

export type Resolution = "raw" | "15m" | "1h" | "1d";

export interface RawSeriesPoint {
  time: string;
  temperature: { value: number | null; observedAt: string | null };
  humidity: { value: number | null; observedAt: string | null };
  remoOnlineState: "online" | "offline" | "mixed" | "unknown";
  gap: boolean;
}

export interface AggregateMetric {
  avg: number | null;
  min: number | null;
  max: number | null;
  sampleCount: number;
  latestObservedAt: string | null;
}

export interface AggregateSeriesPoint {
  time: string;
  temperature: AggregateMetric;
  humidity: AggregateMetric;
  remoOnlineState: "online" | "offline" | "mixed" | "unknown";
  gap: boolean;
}

export interface AirconSegment {
  from: string;
  to: string;
  state: "on" | "off" | "unknown" | "gap";
  mode: string | null;
  targetTemperatureC: number | null;
}

export interface DailySummaryDay {
  date: string;
  temperature: {
    avg: number;
    min: number;
    max: number;
    sampleCount: number;
  } | null;
  humidity: {
    avg: number;
    min: number;
    max: number;
    sampleCount: number;
  } | null;
  gapMinutes: number;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noiseAt(ms: number, salt: number): number {
  const bucket = Math.floor(ms / RAW_STEP_MS);
  const random = mulberry32(bucket * 2654435761 + salt);
  return random() * 2 - 1;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function jstHourOfDay(ms: number): number {
  return ((ms + JST_OFFSET_MS) % DAY_MS) / HOUR_MS;
}

function jstDayStart(ms: number): number {
  return Math.floor((ms + JST_OFFSET_MS) / DAY_MS) * DAY_MS - JST_OFFSET_MS;
}

function jstDateString(dayStartMs: number): string {
  const jst = new Date(dayStartMs + JST_OFFSET_MS);
  const year = jst.getUTCFullYear();
  const month = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jst.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

// A fixed maintenance window (03:10-03:40 JST) has no samples every day.
export function isInGap(ms: number): boolean {
  const hour = jstHourOfDay(ms);
  return hour >= 3 + 10 / 60 && hour < 3 + 40 / 60;
}

export function temperatureAt(ms: number): number {
  const hour = jstHourOfDay(ms);
  const daily = Math.cos(((hour - 15) / 24) * 2 * Math.PI);
  const dayIndex = Math.floor((ms + JST_OFFSET_MS) / DAY_MS);
  const dayShift = Math.sin(dayIndex * 1.7) * 0.6;
  return 25.8 + 2.4 * daily + dayShift + noiseAt(ms, 11) * 0.15;
}

export function humidityAt(ms: number): number {
  const temperature = temperatureAt(ms);
  const value = 58 - (temperature - 26) * 2.4 + noiseAt(ms, 29) * 1.2;
  return Math.min(75, Math.max(38, value));
}

export function selectResolution(
  requested: string,
  spanMs: number,
): { resolution: Resolution } | { error: "range_too_large" } {
  let resolution = requested;
  if (requested === "auto") {
    if (spanMs <= 48 * HOUR_MS) {
      resolution = "raw";
    } else if (spanMs <= 14 * DAY_MS) {
      resolution = "15m";
    } else if (spanMs <= 90 * DAY_MS) {
      resolution = "1h";
    } else {
      resolution = "1d";
    }
  }
  const limits: Record<Resolution, number> = {
    raw: 48 * HOUR_MS,
    "15m": 14 * DAY_MS,
    "1h": 90 * DAY_MS,
    "1d": 10 * 366 * DAY_MS,
  };
  const typed = resolution as Resolution;
  if (spanMs > limits[typed]) {
    return { error: "range_too_large" };
  }
  return { resolution: typed };
}

export interface SeriesOptions {
  fromMs: number;
  toMs: number;
  // Samples exist only up to this time (collection start is implicit).
  dataEndMs: number;
  // Recent points report the Remo as offline after this time (optional).
  offlineAfterMs?: number;
}

export function generateRawPoints(options: SeriesOptions): RawSeriesPoint[] {
  const points: RawSeriesPoint[] = [];
  const start = Math.ceil(options.fromMs / RAW_STEP_MS) * RAW_STEP_MS;
  for (let ms = start; ms <= options.toMs; ms += RAW_STEP_MS) {
    if (ms > options.dataEndMs) {
      break;
    }
    if (isInGap(ms)) {
      points.push({
        time: iso(ms),
        temperature: { value: null, observedAt: null },
        humidity: { value: null, observedAt: null },
        remoOnlineState: "unknown",
        gap: true,
      });
      continue;
    }
    const offline =
      options.offlineAfterMs !== undefined && ms >= options.offlineAfterMs;
    points.push({
      time: iso(ms),
      temperature: {
        value: round1(temperatureAt(ms)),
        observedAt: iso(ms - 80_000),
      },
      humidity: {
        value: round1(humidityAt(ms)),
        observedAt: iso(ms - 70_000),
      },
      remoOnlineState: offline ? "offline" : "online",
      gap: false,
    });
  }
  return points;
}

export function generateAggregatePoints(
  options: SeriesOptions & { resolution: Exclude<Resolution, "raw"> },
): AggregateSeriesPoint[] {
  const bucketMs =
    options.resolution === "15m"
      ? 15 * MINUTE_MS
      : options.resolution === "1h"
        ? HOUR_MS
        : DAY_MS;
  const points: AggregateSeriesPoint[] = [];
  const alignedFrom =
    options.resolution === "1d"
      ? jstDayStart(options.fromMs)
      : Math.floor(options.fromMs / bucketMs) * bucketMs;
  for (let ms = alignedFrom; ms < options.toMs; ms += bucketMs) {
    if (ms > options.dataEndMs) {
      break;
    }
    const bucketEnd = Math.min(ms + bucketMs, options.toMs, options.dataEndMs);
    const samples: number[] = [];
    for (
      let sample = Math.ceil(ms / RAW_STEP_MS) * RAW_STEP_MS;
      sample < bucketEnd;
      sample += RAW_STEP_MS
    ) {
      if (!isInGap(sample)) {
        samples.push(sample);
      }
    }
    if (samples.length === 0) {
      points.push({
        time: iso(ms),
        temperature: emptyAggregateMetric(),
        humidity: emptyAggregateMetric(),
        remoOnlineState: "unknown",
        gap: true,
      });
      continue;
    }
    const offline =
      options.offlineAfterMs !== undefined &&
      samples.some((sample) => sample >= (options.offlineAfterMs ?? Infinity));
    const online =
      options.offlineAfterMs === undefined ||
      samples.some((sample) => sample < (options.offlineAfterMs ?? Infinity));
    points.push({
      time: iso(ms),
      temperature: aggregateMetric(samples, temperatureAt),
      humidity: aggregateMetric(samples, humidityAt),
      remoOnlineState:
        offline && online ? "mixed" : offline ? "offline" : "online",
      gap: false,
    });
  }
  return points;
}

function emptyAggregateMetric(): AggregateMetric {
  return {
    avg: null,
    min: null,
    max: null,
    sampleCount: 0,
    latestObservedAt: null,
  };
}

function aggregateMetric(
  samples: number[],
  valueAt: (ms: number) => number,
): AggregateMetric {
  const values = samples.map((sample) => valueAt(sample));
  const sum = values.reduce((total, value) => total + value, 0);
  const latest = samples[samples.length - 1];
  return {
    avg: round1(sum / values.length),
    min: round1(Math.min(...values)),
    max: round1(Math.max(...values)),
    sampleCount: values.length,
    latestObservedAt: latest === undefined ? null : iso(latest - 80_000),
  };
}

interface ScheduleEntry {
  startHour: number;
  endHour: number;
  mode: string;
  targetTemperatureC: number;
}

// Fixed JST air-conditioner schedule recognized by Nature Remo:
// cooling overnight and in the afternoon, with a target change at 23:00
// so segment splitting on setting changes is visible in charts.
const AIRCON_SCHEDULE: ScheduleEntry[] = [
  { startHour: 0, endHour: 7.5, mode: "cool", targetTemperatureC: 27 },
  { startHour: 12.5, endHour: 17, mode: "cool", targetTemperatureC: 26 },
  { startHour: 21, endHour: 23, mode: "cool", targetTemperatureC: 26.5 },
  { startHour: 23, endHour: 24, mode: "cool", targetTemperatureC: 27 },
];

interface AirconState {
  state: "on" | "off" | "unknown" | "gap";
  mode: string | null;
  targetTemperatureC: number | null;
}

function airconStateAt(ms: number, unknownRecent: boolean): AirconState {
  if (isInGap(ms)) {
    return { state: "gap", mode: null, targetTemperatureC: null };
  }
  if (unknownRecent) {
    return { state: "unknown", mode: null, targetTemperatureC: null };
  }
  const hour = jstHourOfDay(ms);
  for (const entry of AIRCON_SCHEDULE) {
    if (hour >= entry.startHour && hour < entry.endHour) {
      return {
        state: "on",
        mode: entry.mode,
        targetTemperatureC: entry.targetTemperatureC,
      };
    }
  }
  return { state: "off", mode: null, targetTemperatureC: null };
}

export function generateAirconSegments(
  options: SeriesOptions & { unknownAfterMs?: number },
): AirconSegment[] {
  const segments: AirconSegment[] = [];
  const end = Math.min(options.toMs, options.dataEndMs);
  if (end <= options.fromMs) {
    return segments;
  }
  let cursor = options.fromMs;
  let currentState = stateAtWithUnknown(cursor, options.unknownAfterMs);
  let segmentStart = cursor;
  while (cursor < end) {
    const next = Math.min(cursor + MINUTE_MS, end);
    const nextState = stateAtWithUnknown(next, options.unknownAfterMs);
    if (next >= end || !sameState(currentState, nextState)) {
      segments.push({
        from: iso(segmentStart),
        to: iso(next),
        state: currentState.state,
        mode: currentState.mode,
        targetTemperatureC: currentState.targetTemperatureC,
      });
      segmentStart = next;
      currentState = nextState;
    }
    cursor = next;
  }
  if (options.toMs > end) {
    segments.push({
      from: iso(end),
      to: iso(Math.min(options.toMs, end + 12 * HOUR_MS)),
      state: "gap",
      mode: null,
      targetTemperatureC: null,
    });
  }
  return segments;
}

function stateAtWithUnknown(
  ms: number,
  unknownAfterMs: number | undefined,
): AirconState {
  const unknownRecent = unknownAfterMs !== undefined && ms >= unknownAfterMs;
  return airconStateAt(ms, unknownRecent);
}

function sameState(left: AirconState, right: AirconState): boolean {
  return (
    left.state === right.state &&
    left.mode === right.mode &&
    left.targetTemperatureC === right.targetTemperatureC
  );
}

export function generateDailySummary(options: {
  fromMs: number;
  toMs: number;
  dataEndMs: number;
}): DailySummaryDay[] {
  const days: DailySummaryDay[] = [];
  const end = Math.min(options.toMs, options.dataEndMs);
  for (
    let dayStart = jstDayStart(options.fromMs);
    dayStart < end;
    dayStart += DAY_MS
  ) {
    const periodStart = Math.max(dayStart, options.fromMs);
    const periodEnd = Math.min(dayStart + DAY_MS, end);
    if (periodStart >= periodEnd) {
      continue;
    }
    const samples: number[] = [];
    for (
      let sample = Math.ceil(periodStart / RAW_STEP_MS) * RAW_STEP_MS;
      sample < periodEnd;
      sample += RAW_STEP_MS
    ) {
      if (!isInGap(sample)) {
        samples.push(sample);
      }
    }
    const expectedSamples = Math.ceil(
      (periodEnd - Math.ceil(periodStart / RAW_STEP_MS) * RAW_STEP_MS) /
        RAW_STEP_MS,
    );
    const gapMinutes = Math.max(0, expectedSamples - samples.length) * 5;
    if (samples.length === 0) {
      days.push({
        date: jstDateString(dayStart),
        temperature: null,
        humidity: null,
        gapMinutes,
      });
      continue;
    }
    const temperature = aggregateMetric(samples, temperatureAt);
    const humidity = aggregateMetric(samples, humidityAt);
    days.push({
      date: jstDateString(dayStart),
      temperature: {
        avg: temperature.avg ?? 0,
        min: temperature.min ?? 0,
        max: temperature.max ?? 0,
        sampleCount: temperature.sampleCount,
      },
      humidity: {
        avg: humidity.avg ?? 0,
        min: humidity.min ?? 0,
        max: humidity.max ?? 0,
        sampleCount: humidity.sampleCount,
      },
      gapMinutes,
    });
  }
  return days;
}
