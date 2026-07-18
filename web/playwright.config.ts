import { defineConfig, devices } from "@playwright/test";

const webPort = process.env.E2E_WEB_PORT ?? "3000";
const mockPort = process.env.E2E_MOCK_PORT ?? "8090";
const webBaseUrl = `http://127.0.0.1:${webPort}`;
const mockBaseUrl = `http://127.0.0.1:${mockPort}`;

export default defineConfig({
  testDir: "./e2e",
  // The mock API scenario is process-global state, so E2E runs serially.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: webBaseUrl,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "node test/mock-api/server.ts",
      url: `${mockBaseUrl}/__scenario`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: { MOCK_PORT: mockPort },
    },
    {
      command: `npm run dev -- --port ${webPort}`,
      url: webBaseUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        REMO_API_BASE_URL: mockBaseUrl,
      },
    },
  ],
});
