import { describe, expect, it } from "vitest";

import {
  airconSeriesResponseSchema,
  apiFailureSchema,
  currentResponseSchema,
  dailySummaryResponseSchema,
  environmentSeriesResponseSchema,
  statusResponseSchema,
} from "./schemas";
import {
  aggregateEnvironmentSeriesFixture,
  fixtureScenarios,
  invalidContractFixtures,
  rawEnvironmentSeriesFixture,
} from "@/test/fixtures";

describe("API schemas", () => {
  it("accepts every anonymous fixture scenario", () => {
    for (const value of Object.values(fixtureScenarios)) {
      expect(statusResponseSchema.safeParse(value.status).success).toBe(true);
      expect(currentResponseSchema.safeParse(value.current).success).toBe(true);
      expect(
        environmentSeriesResponseSchema.safeParse(value.environmentSeries)
          .success,
      ).toBe(true);
      expect(
        airconSeriesResponseSchema.safeParse(value.airconSeries).success,
      ).toBe(true);
      expect(
        dailySummaryResponseSchema.safeParse(value.dailySummary).success,
      ).toBe(true);
      expect(apiFailureSchema.safeParse(value.error).success).toBe(true);
    }
  });

  it("accepts raw and aggregate environment shapes", () => {
    expect(
      environmentSeriesResponseSchema.parse(rawEnvironmentSeriesFixture).data
        .resolution,
    ).toBe("raw");
    expect(
      environmentSeriesResponseSchema.parse(aggregateEnvironmentSeriesFixture)
        .data.resolution,
    ).toBe("15m");
  });

  it.each([
    "missingRequiredField",
    "wrongValueType",
    "invalidTimestamp",
    "unknownContractEnum",
  ])("rejects invalid status contract: %s", (name) => {
    expect(
      statusResponseSchema.safeParse(invalidContractFixtures[name]).success,
    ).toBe(false);
  });

  it("rejects aggregate metrics in a raw response", () => {
    expect(
      environmentSeriesResponseSchema.safeParse(
        invalidContractFixtures.mixedRawAndAggregate,
      ).success,
    ).toBe(false);
  });

  it.each(["requestId", "generatedAt", "timezone"])(
    "requires status meta.%s",
    (field) => {
      expect(
        statusResponseSchema.safeParse(
          withoutMetaField(fixtureScenarios.normal.status, field),
        ).success,
      ).toBe(false);
    },
  );

  it.each(["requestId", "generatedAt", "timezone"])(
    "requires current meta.%s",
    (field) => {
      expect(
        currentResponseSchema.safeParse(
          withoutMetaField(fixtureScenarios.normal.current, field),
        ).success,
      ).toBe(false);
    },
  );

  it.each([
    "requestId",
    "generatedAt",
    "timezone",
    "from",
    "to",
    "limit",
    "truncated",
  ])("requires environment series meta.%s", (field) => {
    expect(
      environmentSeriesResponseSchema.safeParse(
        withoutMetaField(fixtureScenarios.normal.environmentSeries, field),
      ).success,
    ).toBe(false);
  });

  it.each(["requestId", "generatedAt", "timezone", "limit", "truncated"])(
    "requires aircon series meta.%s",
    (field) => {
      expect(
        airconSeriesResponseSchema.safeParse(
          withoutMetaField(fixtureScenarios.normal.airconSeries, field),
        ).success,
      ).toBe(false);
    },
  );

  it.each(["requestId", "generatedAt", "timezone", "limit", "truncated"])(
    "requires daily summary meta.%s",
    (field) => {
      expect(
        dailySummaryResponseSchema.safeParse(
          withoutMetaField(fixtureScenarios.normal.dailySummary, field),
        ).success,
      ).toBe(false);
    },
  );

  it.each(["requestId", "generatedAt"])(
    "requires error meta.%s while allowing additive fields",
    (field) => {
      expect(
        apiFailureSchema.safeParse(
          withoutMetaField(fixtureScenarios.normal.error, field),
        ).success,
      ).toBe(false);
      expect(
        apiFailureSchema.safeParse({
          ...fixtureScenarios.normal.error,
          meta: {
            ...fixtureScenarios.normal.error.meta,
            futureDiagnostic: "available",
          },
        }).success,
      ).toBe(true);
    },
  );

  it("allows future additive fields", () => {
    const response = {
      ...fixtureScenarios.normal.status,
      data: {
        ...fixtureScenarios.normal.status.data,
        futureStatusDetail: "available",
      },
      futureEnvelopeField: true,
    };
    const parsed = statusResponseSchema.parse(response);
    expect(parsed.data.futureStatusDetail).toBe("available");
    expect(parsed.futureEnvelopeField).toBe(true);
  });
});

function withoutMetaField(
  response: { data?: unknown; error?: unknown; meta: Record<string, unknown> },
  field: string,
): unknown {
  const meta = { ...response.meta };
  delete meta[field];
  return { ...response, meta };
}
