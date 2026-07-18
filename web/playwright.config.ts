import { defineConfig, devices } from "@playwright/test";

const dashboardUrl = "http://127.0.0.1:3100";
const fakeApiUrl = "http://127.0.0.1:3210";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: dashboardUrl,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "mobile-chromium",
      grepInvert: /@desktop/,
      use: {
        ...devices["iPhone 13"],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "tablet-chromium",
      grepInvert: /@desktop/,
      use: {
        ...devices["iPad (gen 7)"],
        viewport: { width: 768, height: 1_024 },
      },
    },
    {
      name: "desktop-chromium",
      grepInvert: /@touch/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1_440, height: 900 },
      },
    },
  ],
  webServer: [
    {
      command: "node e2e/fake-go-api.mjs",
      url: `${fakeApiUrl}/__control/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
      url: dashboardUrl,
      env: {
        REMO_API_BASE_URL: fakeApiUrl,
        TZ: "Asia/Tokyo",
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
