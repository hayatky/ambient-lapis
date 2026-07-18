// Shared scale for the daily range bars. All displayed days share one
// domain per metric (snapped to clean steps) so day-to-day drift stays
// visually comparable.

import type { DailySummaryViewModel } from "@/lib/view-model";

export interface RangeScale {
  min: number;
  max: number;
  // Clean tick values for the ruler row (includes min and max).
  ticks: number[];
}

function buildScale(
  low: number,
  high: number,
  step: number,
  clampMin: number | null,
  clampMax: number | null,
): RangeScale {
  let min = Math.floor(low / step) * step;
  let max = Math.ceil(high / step) * step;
  if (max - min < step * 2) {
    min -= step;
    max += step;
  }
  if (clampMin !== null) {
    min = Math.max(clampMin, min);
  }
  if (clampMax !== null) {
    max = Math.min(clampMax, max);
  }
  const ticks: number[] = [];
  for (let value = min; value <= max; value += step) {
    ticks.push(value);
  }
  return { min, max, ticks };
}

export function temperatureScale(
  days: DailySummaryViewModel[],
): RangeScale | null {
  let low = Infinity;
  let high = -Infinity;
  for (const day of days) {
    if (day.temperature?.minimum != null) {
      low = Math.min(low, day.temperature.minimum);
    }
    if (day.temperature?.maximum != null) {
      high = Math.max(high, day.temperature.maximum);
    }
  }
  if (!Number.isFinite(low) || !Number.isFinite(high)) {
    return null;
  }
  return buildScale(low, high, 5, null, null);
}

export function humidityScale(
  days: DailySummaryViewModel[],
): RangeScale | null {
  let low = Infinity;
  let high = -Infinity;
  for (const day of days) {
    if (day.humidity?.minimum != null) {
      low = Math.min(low, day.humidity.minimum);
    }
    if (day.humidity?.maximum != null) {
      high = Math.max(high, day.humidity.maximum);
    }
  }
  if (!Number.isFinite(low) || !Number.isFinite(high)) {
    return null;
  }
  return buildScale(low, high, 10, 0, 100);
}

// Position of a value inside the scale, as a 0–100 percentage.
export function scalePosition(scale: RangeScale, value: number): number {
  if (scale.max === scale.min) {
    return 0;
  }
  const ratio = (value - scale.min) / (scale.max - scale.min);
  return Math.max(0, Math.min(100, ratio * 100));
}
