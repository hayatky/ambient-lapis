import { afterEach, describe, expect, it, vi } from "vitest";

import { fixtureScenarios } from "@/test/fixtures";
import { browserApi } from "./browser-client";

const range = {
  from: "2026-07-18T12:00:00.000Z",
  to: "2026-07-18T13:00:00.000Z",
};

describe("browserApi", () => {
  afterEach(() => vi.restoreAllMocks());

  it("wires all five methods only to their same-origin BFF paths", async () => {
    const replies = [
      fixtureScenarios.normal.status,
      fixtureScenarios.normal.current,
      fixtureScenarios.normal.environmentSeries,
      fixtureScenarios.normal.airconSeries,
      fixtureScenarios.normal.dailySummary,
    ];
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () =>
          new Response(JSON.stringify(replies.shift()), { status: 200 }),
      );

    await browserApi.status();
    await browserApi.current();
    await browserApi.environmentSeries({ ...range, resolution: "raw" });
    await browserApi.airconSeries(range);
    await browserApi.dailySummary(range);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/v1/status",
      "/api/v1/current",
      "/api/v1/environment/series?from=2026-07-18T12%3A00%3A00.000Z&to=2026-07-18T13%3A00%3A00.000Z&resolution=raw",
      "/api/v1/aircon/series?from=2026-07-18T12%3A00%3A00.000Z&to=2026-07-18T13%3A00%3A00.000Z",
      "/api/v1/daily-summary?from=2026-07-18T12%3A00%3A00.000Z&to=2026-07-18T13%3A00%3A00.000Z",
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({ headers: { Accept: "application/json" } });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("uses a 10 second timeout and composes an external cancellation signal", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    let requestSignal: AbortSignal | null | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      requestSignal = init?.signal;
      return new Response(JSON.stringify(fixtureScenarios.normal.status), {
        status: 200,
      });
    });
    const controller = new AbortController();

    await browserApi.status({ signal: controller.signal });
    controller.abort();

    expect(timeoutSpy).toHaveBeenCalledWith(10_000);
    expect(requestSignal?.aborted).toBe(true);
  });
});
