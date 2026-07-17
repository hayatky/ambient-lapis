import type { z } from "zod";

import { ApiContractError, ApiHttpError } from "./errors";
import { apiFailureSchema } from "./schemas";

export async function parseApiResponse<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<T> {
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw new ApiContractError("API response is not valid JSON", {
      cause: error,
    });
  }

  if (!response.ok) {
    const failure = apiFailureSchema.safeParse(body);
    if (!failure.success) {
      throw new ApiContractError(
        "API error response does not match the expected contract",
        {
          cause: failure.error,
        },
      );
    }
    throw new ApiHttpError(response.status, failure.data);
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiContractError(undefined, { cause: result.error });
  }
  return result.data;
}
