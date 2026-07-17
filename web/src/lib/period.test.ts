import {
  maxCustomDate,
  resolveCustomPeriod,
  resolvePresetPeriod,
} from "./period";

// 2026-07-18 21:35 JST
const NOW = new Date("2026-07-18T12:35:00.000Z");

describe("resolvePresetPeriod", () => {
  it("resolves 24h to the last 24 hours ending now", () => {
    const period = resolvePresetPeriod("24h", NOW);
    expect(period.series.toIso).toBe(NOW.toISOString());
    expect(period.series.fromIso).toBe("2026-07-17T12:35:00.000Z");
  });

  it("keeps a 7-day daily summary for the 24h preset", () => {
    const period = resolvePresetPeriod("24h", NOW);
    // 7 JST days including today: from 2026-07-12 00:00 JST.
    expect(period.dailySummary.fromIso).toBe("2026-07-11T15:00:00.000Z");
    expect(period.dailySummary.toIso).toBe(NOW.toISOString());
  });

  it("resolves 7d and 30d spans", () => {
    expect(resolvePresetPeriod("7d", NOW).series.fromIso).toBe(
      "2026-07-11T12:35:00.000Z",
    );
    expect(resolvePresetPeriod("30d", NOW).series.fromIso).toBe(
      "2026-06-18T12:35:00.000Z",
    );
  });

  it("aligns the 30d daily summary to 30 JST days including today", () => {
    const period = resolvePresetPeriod("30d", NOW);
    expect(period.dailySummary.fromIso).toBe("2026-06-18T15:00:00.000Z");
  });
});

describe("resolveCustomPeriod", () => {
  it("accepts a whole-day JST range ending before today", () => {
    const result = resolveCustomPeriod("2026-07-01", "2026-07-10", NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.period.series.fromIso).toBe("2026-06-30T15:00:00.000Z");
      expect(result.period.series.toIso).toBe("2026-07-10T15:00:00.000Z");
      expect(result.period.dailySummary).toEqual(result.period.series);
    }
  });

  it("caps a range ending today at the current time", () => {
    const result = resolveCustomPeriod("2026-07-18", "2026-07-18", NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.period.series.toIso).toBe(NOW.toISOString());
    }
  });

  it("rejects a future end date", () => {
    const result = resolveCustomPeriod("2026-07-01", "2026-07-19", NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("未来");
    }
  });

  it("rejects an inverted range", () => {
    const result = resolveCustomPeriod("2026-07-10", "2026-07-01", NOW);
    expect(result.ok).toBe(false);
  });

  it("rejects missing dates", () => {
    expect(resolveCustomPeriod("", "2026-07-01", NOW).ok).toBe(false);
    expect(resolveCustomPeriod("2026-07-01", "", NOW).ok).toBe(false);
  });

  it("rejects ranges longer than ten years", () => {
    const result = resolveCustomPeriod("2010-01-01", "2026-07-01", NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("10年");
    }
  });
});

describe("maxCustomDate", () => {
  it("returns today's JST date", () => {
    expect(maxCustomDate(NOW)).toBe("2026-07-18");
    // 2026-07-18 23:30 UTC is already 2026-07-19 in JST.
    expect(maxCustomDate(new Date("2026-07-18T23:30:00.000Z"))).toBe(
      "2026-07-19",
    );
  });
});
