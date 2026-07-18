import type { RangeQuery } from "../api";
import type {
  CustomHistoryInput,
  HistoryPreset,
  HistoryRange,
  RangeValidationResult,
} from "./types";

const JST_OFFSET_MS = 9 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const presetDurationMs = {
  "24h": DAY_MS,
  "7d": 7 * DAY_MS,
  "30d": 30 * DAY_MS,
} satisfies Record<Exclude<HistoryPreset, "custom">, number>;

export function jstDateString(date: Date): string {
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

function parseJstDate(value: string): Date | null {
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const parsed = new Date(`${value}T00:00:00+09:00`);
  if (!Number.isFinite(parsed.getTime()) || jstDateString(parsed) !== value) {
    return null;
  }
  return parsed;
}

function addJstDays(value: string, days: number): Date {
  const date = parseJstDate(value);
  if (!date) throw new Error("invalid JST date");
  return new Date(date.getTime() + days * DAY_MS);
}

function tenYearsAfter(date: Date): Date {
  const result = new Date(date);
  result.setUTCFullYear(result.getUTCFullYear() + 10);
  return result;
}

export function historyRangeForPreset(
  preset: Exclude<HistoryPreset, "custom">,
  now: Date,
): HistoryRange {
  const to = new Date(now);
  const from = new Date(to.getTime() - presetDurationMs[preset]);
  return { preset, from: from.toISOString(), to: to.toISOString() };
}

/** Returns the seven JST calendar dates ending today. */
export function dailySummaryRange(now: Date): RangeQuery {
  const today = jstDateString(now);
  return {
    from: addJstDays(today, -6).toISOString(),
    to: now.toISOString(),
  };
}

/**
 * Converts inclusive date inputs into an API half-open range. A past end date
 * ends at the following JST midnight; today ends at the supplied current time.
 */
export function customHistoryRange(
  input: CustomHistoryInput,
  now: Date,
): RangeValidationResult {
  const from = parseJstDate(input.fromDate);
  if (!from) {
    return {
      ok: false,
      error: {
        code: "invalidDate",
        field: "fromDate",
        message: "開始日を正しい日付で入力してください。",
      },
    };
  }
  const toStart = parseJstDate(input.toDate);
  if (!toStart) {
    return {
      ok: false,
      error: {
        code: "invalidDate",
        field: "toDate",
        message: "終了日を正しい日付で入力してください。",
      },
    };
  }

  const today = jstDateString(now);
  if (input.fromDate > today) {
    return {
      ok: false,
      error: {
        code: "futureDate",
        field: "fromDate",
        message: "未来の日付は開始日に指定できません。",
      },
    };
  }
  if (input.toDate > today) {
    return {
      ok: false,
      error: {
        code: "futureDate",
        field: "toDate",
        message: "未来の日付は終了日に指定できません。",
      },
    };
  }
  if (input.fromDate > input.toDate) {
    return {
      ok: false,
      error: {
        code: "reversedRange",
        field: "fromDate",
        message: "開始日は終了日以前にしてください。",
      },
    };
  }

  const to =
    input.toDate === today ? new Date(now) : addJstDays(input.toDate, 1);
  if (from.getTime() >= to.getTime()) {
    return {
      ok: false,
      error: {
        code: "reversedRange",
        field: "fromDate",
        message: "開始時刻より後の期間を指定してください。",
      },
    };
  }
  if (to.getTime() > tenYearsAfter(from).getTime()) {
    return {
      ok: false,
      error: {
        code: "rangeTooLarge",
        field: "toDate",
        message: "表示期間は10年以内にしてください。",
      },
    };
  }

  return {
    ok: true,
    value: {
      preset: "custom",
      from: from.toISOString(),
      to: to.toISOString(),
      fromDate: input.fromDate,
      toDate: input.toDate,
    },
  };
}
