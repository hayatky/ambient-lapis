import { describe, expect, it } from "vitest";

import {
  customHistoryRange,
  dailySummaryRange,
  historyRangeForPreset,
  jstDateString,
} from "./range";

describe("dashboard ranges", () => {
  it("builds rolling preset ranges ending at the supplied current time", () => {
    const now = new Date("2026-07-18T12:35:00.000Z");

    expect(historyRangeForPreset("24h", now)).toEqual({
      preset: "24h",
      from: "2026-07-17T12:35:00.000Z",
      to: "2026-07-18T12:35:00.000Z",
    });
    expect(historyRangeForPreset("7d", now).from).toBe(
      "2026-07-11T12:35:00.000Z",
    );
    expect(historyRangeForPreset("30d", now).from).toBe(
      "2026-06-18T12:35:00.000Z",
    );
  });

  it("uses seven JST calendar dates even immediately after JST midnight", () => {
    const now = new Date("2026-07-18T15:30:00.000Z");

    expect(jstDateString(now)).toBe("2026-07-19");
    expect(dailySummaryRange(now)).toEqual({
      from: "2026-07-12T15:00:00.000Z",
      to: "2026-07-18T15:30:00.000Z",
    });
  });

  it("turns inclusive past dates into a half-open JST range", () => {
    const result = customHistoryRange(
      { fromDate: "2026-07-16", toDate: "2026-07-17" },
      new Date("2026-07-18T12:35:00.000Z"),
    );

    expect(result).toEqual({
      ok: true,
      value: {
        preset: "custom",
        from: "2026-07-15T15:00:00.000Z",
        to: "2026-07-17T15:00:00.000Z",
        fromDate: "2026-07-16",
        toDate: "2026-07-17",
      },
    });
  });

  it("ends a range whose end date is today at now instead of tomorrow", () => {
    const now = new Date("2026-07-18T12:35:00.000Z");
    const result = customHistoryRange(
      { fromDate: "2026-07-18", toDate: "2026-07-18" },
      now,
    );

    expect(result.ok && result.value.to).toBe(now.toISOString());
  });

  it.each([
    [
      { fromDate: "2026-02-30", toDate: "2026-07-18" },
      "invalidDate",
      "fromDate",
    ],
    [
      { fromDate: "2026-07-19", toDate: "2026-07-19" },
      "futureDate",
      "fromDate",
    ],
    [
      { fromDate: "2026-07-18", toDate: "2026-07-17" },
      "reversedRange",
      "fromDate",
    ],
    [
      { fromDate: "2016-07-17", toDate: "2026-07-18" },
      "rangeTooLarge",
      "toDate",
    ],
  ] as const)("rejects invalid custom range %#", (input, code, field) => {
    const result = customHistoryRange(
      input,
      new Date("2026-07-18T12:35:00.000Z"),
    );

    expect(result).toMatchObject({ ok: false, error: { code, field } });
  });
});
