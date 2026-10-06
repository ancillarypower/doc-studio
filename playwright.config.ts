import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:4173",
    locale: "zh-TW",
    timezoneId: "Asia/Taipei",
    // reducedMotion is a browser-context option, not a top-level test option
    contextOptions: { reducedMotion: "reduce" },
  },
  webServer: [
    { command: "pnpm preview", url: "http://localhost:4173", reuseExistingServer: !process.env.CI },
    { command: "node scripts/serve.mjs reference/build 4174", url: "http://localhost:4174", reuseExistingServer: !process.env.CI },
  ],
});
