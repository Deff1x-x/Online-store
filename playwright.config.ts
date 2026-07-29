import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "scripts/tz/e2e",
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    trace: "off",
    video: "off",
    screenshot: "off",
    actionTimeout: 20_000,
  },
});
