import type { ApiFailure } from "./schemas";

export class ApiContractError extends Error {
  readonly name = "ApiContractError";

  constructor(
    message = "API response does not match the expected contract",
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class ApiHttpError extends Error {
  readonly name = "ApiHttpError";

  constructor(
    readonly status: number,
    readonly failure: ApiFailure,
  ) {
    super(failure.error.message);
  }
}

export class ApiConfigurationError extends Error {
  readonly name = "ApiConfigurationError";

  constructor(
    message = "The internal API is not configured",
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
