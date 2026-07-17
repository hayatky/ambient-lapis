import type { DisplayTimestamp } from "./types";

const TIMEZONE = "Asia/Tokyo";

const dateTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
});

export function toDisplayTimestamp(iso: string, now: Date): DisplayTimestamp {
  const epochMs = Date.parse(iso);
  return {
    iso,
    epochMs,
    label: dateTimeFormatter.format(epochMs),
    ageSeconds: Math.floor((now.getTime() - epochMs) / 1_000),
  };
}

export function formatDate(date: string): string {
  return dateFormatter.format(new Date(`${date}T00:00:00+09:00`));
}

export function formatAge(ageSeconds: number): string {
  if (ageSeconds < 60) {
    return "1分未満前";
  }
  if (ageSeconds < 3_600) {
    return `${Math.floor(ageSeconds / 60)}分前`;
  }
  if (ageSeconds < 86_400) {
    return `${Math.floor(ageSeconds / 3_600)}時間前`;
  }
  return `${Math.floor(ageSeconds / 86_400)}日前`;
}
