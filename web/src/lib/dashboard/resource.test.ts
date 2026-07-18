import { describe, expect, it } from "vitest";

import { ApiConfigurationError, ApiContractError, ApiHttpError } from "../api";
import {
  beginResourceRequest,
  failResource,
  loadingResource,
  readyResource,
  sanitizeUiError,
} from "./resource";

const failure = {
  error: { code: "internal", message: "sensitive upstream detail" },
  meta: {
    requestId: "request-test",
    generatedAt: "2026-07-18T12:35:00.000Z",
  },
};

describe("dashboard resource state", () => {
  it("keeps last-good data while refreshing and after a failure", () => {
    const ready = readyResource({ value: 26.4 });

    expect(beginResourceRequest(ready)).toEqual({
      status: "refreshing",
      data: { value: 26.4 },
      error: null,
    });
    expect(failResource(ready, new Error("private error"))).toMatchObject({
      status: "error",
      data: { value: 26.4 },
      error: { code: "unknown" },
    });
    expect(beginResourceRequest(loadingResource())).toMatchObject({
      status: "loading",
      data: null,
    });
  });

  it("maps known failures to fixed Japanese copy without raw details", () => {
    const values = [
      sanitizeUiError(new ApiConfigurationError("secret path")),
      sanitizeUiError(new ApiContractError("raw payload")),
      sanitizeUiError(new ApiHttpError(503, failure)),
      sanitizeUiError(new ApiHttpError(422, failure)),
      sanitizeUiError(new TypeError("http://internal-host")),
    ];
    const serialized = JSON.stringify(values);

    expect(values.map((value) => value.code)).toEqual([
      "configuration",
      "contract",
      "notReady",
      "invalidRequest",
      "unavailable",
    ]);
    expect(serialized).not.toContain("secret path");
    expect(serialized).not.toContain("sensitive upstream detail");
    expect(serialized).not.toContain("internal-host");
  });
});
