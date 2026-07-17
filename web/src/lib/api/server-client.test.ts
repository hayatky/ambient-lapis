// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { fixtureScenarios } from "@/test/fixtures";

vi.mock("server-only", () => ({}));

const range = {
  from: "2026-07-18T12:00:00.000Z",
  to: "2026-07-18T13:00:00.000Z",
};

describe("serverApi", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("wires current endpoints as no-store and history endpoints with 30 second revalidation", async () => {
    vi.stubEnv("REMO_API_BASE_URL", "http://remo-api:8080");
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
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const { serverApi } = await import("./server-client");

    await serverApi.status();
    await serverApi.current();
    await serverApi.environmentSeries({ ...range, resolution: "raw" });
    await serverApi.airconSeries(range);
    await serverApi.dailySummary(range);

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "http://remo-api:8080/api/v1/status",
      "http://remo-api:8080/api/v1/current",
      "http://remo-api:8080/api/v1/environment/series?from=2026-07-18T12%3A00%3A00.000Z&to=2026-07-18T13%3A00%3A00.000Z&resolution=raw",
      "http://remo-api:8080/api/v1/aircon/series?from=2026-07-18T12%3A00%3A00.000Z&to=2026-07-18T13%3A00%3A00.000Z",
      "http://remo-api:8080/api/v1/daily-summary?from=2026-07-18T12%3A00%3A00.000Z&to=2026-07-18T13%3A00%3A00.000Z",
    ]);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store" });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ cache: "no-store" });
    for (const call of fetchMock.mock.calls.slice(2)) {
      expect(call[1]).toMatchObject({ next: { revalidate: 30 } });
      expect(call[1]?.signal).toBeInstanceOf(AbortSignal);
    }
    expect(timeoutSpy).toHaveBeenCalledTimes(5);
    expect(timeoutSpy).toHaveBeenLastCalledWith(8_000);
  });

  it.each([
    undefined,
    "not a URL",
    "ftp://remo-api",
    "http://user:secret@remo-api",
  ])("rejects a missing or invalid internal base URL: %s", async (baseUrl) => {
    if (baseUrl === undefined) delete process.env.REMO_API_BASE_URL;
    else vi.stubEnv("REMO_API_BASE_URL", baseUrl);
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { serverApi } = await import("./server-client");

    await expect(serverApi.status()).rejects.toMatchObject({
      name: "ApiConfigurationError",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
