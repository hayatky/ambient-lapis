import type { DailySummaryViewModel } from "@/lib/view-model";

import { humidityScale, scalePosition, temperatureScale } from "./daily-range";

function day(
  date: string,
  temperature: [number, number, number] | null,
  humidity: [number, number, number] | null,
  gapMinutes = 0,
): DailySummaryViewModel {
  return {
    date,
    dateLabel: date,
    temperature: temperature
      ? {
          minimum: temperature[0],
          average: temperature[1],
          maximum: temperature[2],
          sampleCount: 100,
        }
      : null,
    humidity: humidity
      ? {
          minimum: humidity[0],
          average: humidity[1],
          maximum: humidity[2],
          sampleCount: 100,
        }
      : null,
    gapMinutes,
  };
}

describe("temperatureScale", () => {
  it("snaps the shared domain to 5-degree steps across all days", () => {
    const scale = temperatureScale([
      day("2026-07-18", [22.7, 23.1, 23.7], null),
      day("2026-07-17", [23.6, 26.2, 28.6], null),
    ]);
    expect(scale).toEqual({ min: 20, max: 30, ticks: [20, 25, 30] });
  });

  it("returns null when no day has temperature data", () => {
    expect(temperatureScale([day("2026-07-18", null, null)])).toBeNull();
  });

  it("widens degenerate domains", () => {
    const scale = temperatureScale([day("2026-07-18", [25, 25, 25], null)]);
    expect(scale).not.toBeNull();
    if (scale) {
      expect(scale.max - scale.min).toBeGreaterThanOrEqual(10);
    }
  });
});

describe("humidityScale", () => {
  it("snaps to 10-percent steps and clamps to 0-100", () => {
    const scale = humidityScale([
      day("2026-07-18", null, [51, 58, 64]),
      day("2026-07-17", null, [63, 65, 67]),
    ]);
    expect(scale).toEqual({ min: 50, max: 70, ticks: [50, 60, 70] });
  });

  it("never exceeds the physical bounds", () => {
    const scale = humidityScale([day("2026-07-18", null, [2, 50, 99])]);
    expect(scale).not.toBeNull();
    if (scale) {
      expect(scale.min).toBeGreaterThanOrEqual(0);
      expect(scale.max).toBeLessThanOrEqual(100);
    }
  });
});

describe("scalePosition", () => {
  const scale = { min: 20, max: 30, ticks: [20, 25, 30] };

  it("maps values to percentages inside the domain", () => {
    expect(scalePosition(scale, 20)).toBe(0);
    expect(scalePosition(scale, 25)).toBe(50);
    expect(scalePosition(scale, 30)).toBe(100);
  });

  it("clamps values outside the domain", () => {
    expect(scalePosition(scale, 10)).toBe(0);
    expect(scalePosition(scale, 40)).toBe(100);
  });
});
