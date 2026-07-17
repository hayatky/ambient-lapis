// Period selection model for the history section. Presets resolve to a
// from/to range ending at "now"; custom ranges are whole JST days chosen
// with date inputs. The API resolution always stays "auto".

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const JST_OFFSET_MS = 9 * HOUR_MS;

export const PERIOD_PRESETS = ["24h", "7d", "30d", "custom"] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  "24h": "24時間",
  "7d": "7日",
  "30d": "30日",
  custom: "任意",
};

export interface PeriodRange {
  fromIso: string;
  toIso: string;
}

// Daily summary always spans whole JST days; presets shorter than a week
// keep a 7-day summary so the section stays meaningful.
export interface ResolvedPeriod {
  series: PeriodRange;
  dailySummary: PeriodRange;
}

export function jstDateString(ms: number): string {
  const jst = new Date(ms + JST_OFFSET_MS);
  const year = jst.getUTCFullYear();
  const month = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jst.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function jstDayStartMs(ms: number): number {
  return Math.floor((ms + JST_OFFSET_MS) / DAY_MS) * DAY_MS - JST_OFFSET_MS;
}

function jstDateToMs(date: string): number {
  return Date.parse(`${date}T00:00:00.000+09:00`);
}

function lastDaysRange(now: Date, days: number): PeriodRange {
  const toMs = jstDayStartMs(now.getTime()) + DAY_MS;
  return {
    fromIso: new Date(toMs - days * DAY_MS).toISOString(),
    toIso: new Date(Math.min(toMs, now.getTime())).toISOString(),
  };
}

export function resolvePresetPeriod(
  preset: Exclude<PeriodPreset, "custom">,
  now: Date,
): ResolvedPeriod {
  const nowMs = now.getTime();
  const days = preset === "24h" ? 7 : preset === "7d" ? 7 : 30;
  const dailySummary = lastDaysRange(now, days);
  const series =
    preset === "24h"
      ? {
          fromIso: new Date(nowMs - 24 * HOUR_MS).toISOString(),
          toIso: new Date(nowMs).toISOString(),
        }
      : preset === "7d"
        ? {
            fromIso: new Date(nowMs - 7 * DAY_MS).toISOString(),
            toIso: new Date(nowMs).toISOString(),
          }
        : {
            fromIso: new Date(nowMs - 30 * DAY_MS).toISOString(),
            toIso: new Date(nowMs).toISOString(),
          };
  return { series, dailySummary };
}

export type CustomRangeResult =
  | { ok: true; period: ResolvedPeriod }
  | { ok: false; message: string };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function resolveCustomPeriod(
  fromDate: string,
  toDate: string,
  now: Date,
): CustomRangeResult {
  if (!DATE_PATTERN.test(fromDate) || !DATE_PATTERN.test(toDate)) {
    return { ok: false, message: "開始日と終了日を入力してください。" };
  }
  const fromMs = jstDateToMs(fromDate);
  const toMs = jstDateToMs(toDate);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
    return { ok: false, message: "日付の形式が正しくありません。" };
  }
  if (fromMs > toMs) {
    return {
      ok: false,
      message: "開始日は終了日と同じか、それより前にしてください。",
    };
  }
  const todayStartMs = jstDayStartMs(now.getTime());
  if (toMs > todayStartMs) {
    return { ok: false, message: "終了日に未来の日付は指定できません。" };
  }
  if (toMs - fromMs > 10 * 366 * DAY_MS) {
    return { ok: false, message: "期間は10年以内にしてください。" };
  }
  // The range covers whole JST days: from 00:00 on the start date to
  // 24:00 on the end date, capped at the current time.
  const rangeEndMs = Math.min(toMs + DAY_MS, now.getTime());
  const range: PeriodRange = {
    fromIso: new Date(fromMs).toISOString(),
    toIso: new Date(rangeEndMs).toISOString(),
  };
  return { ok: true, period: { series: range, dailySummary: range } };
}

export function maxCustomDate(now: Date): string {
  return jstDateString(now.getTime());
}
