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
