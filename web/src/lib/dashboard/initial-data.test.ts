// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import type { AmbientLapisApi } from "../api";
import { fixtureScenarios, FIXTURE_NOW } from "@/test/fixtures";
import { loadDashboardInitialData } from "./initial-data";

function api(overrides: Partial<AmbientLapisApi> = {}): AmbientLapisApi {
  const fixture = fixtureScenarios.normal;
  return {
    status: vi.fn().mockResolvedValue(fixture.status),
    current: vi.fn().mockResolvedValue(fixture.current),
    environmentSeries: vi.fn().mockResolvedValue(fixture.environmentSeries),
    airconSeries: vi.fn().mockResolvedValue(fixture.airconSeries),
    dailySummary: vi.fn().mockResolvedValue(fixture.dailySummary),
    ...overrides,
  };
}

describe("initial dashboard loader", () => {
  it("loads all five endpoints with the planned JST ranges", async () => {
    const client = api();
    const initial = await loadDashboardInitialData(
      client,
      new Date(FIXTURE_NOW),
    );

    expect(
      Object.values(initial.resources).every((item) => item.status === "ready"),
    ).toBe(true);
    expect(client.environmentSeries).toHaveBeenCalledWith({
      from: "2026-07-17T12:35:00.000Z",
      to: FIXTURE_NOW,
      resolution: "auto",
    });
    expect(client.airconSeries).toHaveBeenCalledWith(initial.historyRange);
    expect(client.dailySummary).toHaveBeenCalledWith({
      from: "2026-07-11T15:00:00.000Z",
      to: FIXTURE_NOW,
    });
  });

  it("keeps successful resources when another endpoint fails", async () => {
    const client = api({
      current: vi.fn().mockRejectedValue(new TypeError("internal URL")),
      airconSeries: vi.fn().mockRejectedValue(new Error("raw failure")),
    });
    const initial = await loadDashboardInitialData(
      client,
      new Date(FIXTURE_NOW),
    );

    expect(initial.resources.status.status).toBe("ready");
    expect(initial.resources.current).toMatchObject({
      status: "error",
      data: null,
      error: { code: "unavailable" },
    });
    expect(initial.resources.environmentSeries.status).toBe("ready");
    expect(initial.resources.airconSeries.status).toBe("error");
    expect(JSON.stringify(initial)).not.toContain("raw failure");
  });

  it("returns a serializable error shell when every endpoint fails", async () => {
    const reject = vi.fn().mockRejectedValue(new Error("do not expose"));
    const throwSynchronously = vi.fn(() => {
      throw new Error("synchronous secret");
    });
    const initial = await loadDashboardInitialData(
      api({
        status: throwSynchronously,
        current: reject,
        environmentSeries: reject,
        airconSeries: reject,
        dailySummary: reject,
      }),
      new Date(FIXTURE_NOW),
    );

    expect(
      Object.values(initial.resources).every((item) => item.status === "error"),
    ).toBe(true);
    expect(JSON.stringify(initial)).not.toContain("do not expose");
    expect(JSON.stringify(initial)).not.toContain("synchronous secret");
    expect(reject).toHaveBeenCalledTimes(4);
    expect(() => structuredClone(initial)).not.toThrow();
  });
});
