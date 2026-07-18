import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const MOCK_API_URL = `http://127.0.0.1:${process.env.E2E_MOCK_PORT ?? "8090"}`;

export type ScenarioName =
  | "normal"
  | "initializing"
  | "noData"
  | "partialEnvironmentOnly"
  | "partialAirconOnly"
  | "collectionStopped"
  | "remoOffline"
  | "unchangedReadings"
  | "airconUnknown"
  | "unknownAirconMode"
  | "fullError"
  | "historyError";

export async function setScenario(
  request: APIRequestContext,
  name: ScenarioName,
): Promise<void> {
  const response = await request.post(`${MOCK_API_URL}/__scenario`, {
    data: { name },
  });
  expect(response.ok()).toBeTruthy();
}

export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  return errors;
}
