// @vitest-environment node

import {
  validateEnvironmentSeriesQuery,
  validateNoQuery,
  validateRangeQuery,
} from "./query";

function request(search = ""): Request {
  return new Request(`http://localhost/api/v1/environment/series${search}`);
}

async function expectError(
  result: ReturnType<typeof validateRangeQuery>,
  status: number,
  field: string,
): Promise<void> {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.response.status).toBe(status);
  await expect(result.response.json()).resolves.toMatchObject({
    error: { field },
    meta: { requestId: expect.any(String), generatedAt: expect.any(String) },
  });
}

describe("BFF query validation", () => {
  it("accepts only an empty query for status and current", async () => {
    expect(validateNoQuery(request()).ok).toBe(true);

    const result = validateNoQuery(request("?debug=true"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      await expect(result.response.json()).resolves.toMatchObject({
        error: { code: "invalid_parameter", field: "debug" },
      });
    }
  });

  it.each([
    ["", 400, "from"],
    ["?from=2026-07-18T12%3A00%3A00Z", 400, "to"],
    ["?from=no&to=2026-07-18T13%3A00%3A00Z", 400, "from"],
    ["?from=2026-02-30T12%3A00%3A00Z&to=2026-07-18T13%3A00%3A00Z", 400, "from"],
    ["?from=2026-07-18T12%3A00%3A00Z&to=2026-07-18T12%3A00%3A00Z", 422, "from"],
    ["?from=2026-07-18T12%3A00%3A00Z&to=2036-07-19T12%3A00%3A00Z", 422, "to"],
    [
      "?from=2026-07-18T12%3A00%3A00Z&from=2026-07-18T12%3A01%3A00Z&to=2026-07-18T13%3A00%3A00Z",
      400,
      "from",
    ],
    [
      "?from=2026-07-18T12%3A00%3A00Z&to=2026-07-18T13%3A00%3A00Z&extra=x",
      400,
      "extra",
    ],
  ])("rejects invalid range %s", async (search, status, field) => {
    await expectError(validateRangeQuery(request(search)), status, field);
  });

  it("accepts offsets and canonicalizes allowed parameters", () => {
    const result = validateRangeQuery(
      request(
        "?from=2026-07-18T21%3A00%3A00%2B09%3A00&to=2026-07-18T22%3A00%3A00%2B09%3A00",
      ),
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        from: "2026-07-18T21:00:00+09:00",
        to: "2026-07-18T22:00:00+09:00",
      },
    });
    if (result.ok) expect(result.search).not.toContain("extra");
  });

  it.each(["auto", "raw", "15m", "1h", "1d"])(
    "accepts the %s resolution",
    (resolution) => {
      const result = validateEnvironmentSeriesQuery(
        request(
          `?from=2026-07-18T12%3A00%3A00Z&to=2026-07-18T13%3A00%3A00Z&resolution=${resolution}`,
        ),
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.resolution).toBe(resolution);
    },
  );

  it("defaults resolution to auto and rejects unknown resolutions", async () => {
    const valid = validateEnvironmentSeriesQuery(
      request("?from=2026-07-18T12%3A00%3A00Z&to=2026-07-18T13%3A00%3A00Z"),
    );
    expect(valid.ok && valid.value.resolution).toBe("auto");

    const invalid = validateEnvironmentSeriesQuery(
      request(
        "?from=2026-07-18T12%3A00%3A00Z&to=2026-07-18T13%3A00%3A00Z&resolution=5m",
      ),
    );
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.response.status).toBe(400);
      await expect(invalid.response.json()).resolves.toMatchObject({
        error: { field: "resolution" },
      });
    }
  });
});
