import { describe, expect, it } from "vitest";

import { fixtureScenarios } from "@/test/fixtures";
import { ApiContractError, ApiHttpError } from "./errors";
import { parseApiResponse } from "./parse";
import { statusResponseSchema } from "./schemas";

describe("parseApiResponse", () => {
  it("returns a validated success envelope", async () => {
    const response = new Response(
      JSON.stringify(fixtureScenarios.normal.status),
      { status: 200 },
    );
    await expect(
      parseApiResponse(response, statusResponseSchema),
    ).resolves.toEqual(fixtureScenarios.normal.status);
  });

  it("turns a valid failure envelope into ApiHttpError", async () => {
    const response = new Response(
      JSON.stringify(fixtureScenarios.normal.error),
      { status: 503 },
    );
    await expect(
      parseApiResponse(response, statusResponseSchema),
    ).rejects.toMatchObject({
      name: "ApiHttpError",
      status: 503,
    } satisfies Partial<ApiHttpError>);
  });

  it("does not expose an invalid body through the contract error message", async () => {
    const response = new Response("secret body", { status: 200 });
    const error = await parseApiResponse(response, statusResponseSchema).catch(
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(ApiContractError);
    expect(String(error)).not.toContain("secret body");
  });
});
