import { defineConfig, devices } from "@playwright/test";

const parsedSuiteTimeoutMs = Number.parseInt(process.env.E2E_SUITE_TIMEOUT_MS ?? "", 10);
const suiteTimeoutMs =
  Number.isFinite(parsedSuiteTimeoutMs) && parsedSuiteTimeoutMs >= 60_000
    ? parsedSuiteTimeoutMs
    : 15 * 60 * 1000;
const rawE2EPort = process.env.E2E_PORT?.trim();
const parsedE2EPort = Number.parseInt(rawE2EPort ?? "", 10);

if (
  rawE2EPort &&
  (!Number.isInteger(parsedE2EPort) || parsedE2EPort < 1 || parsedE2EPort > 65_535)
) {
  throw new Error("E2E_PORT must be an integer between 1 and 65535.");
}

const e2ePort = rawE2EPort ? parsedE2EPort : 3100;
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  globalTeardown: "./scripts/stop-e2e-server.mjs",
  fullyParallel: false,
  globalTimeout: suiteTimeoutMs,
  // The suite mutates one disposable database; serial workers prevent fixture races.
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: e2eBaseUrl,
    trace: "on-first-retry",
  },
  webServer: {
    command: "node scripts/e2e-dev-server.mjs",
    url: e2eBaseUrl,
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      E2E_NEXT_DIST_DIR: ".codex-tmp/next-e2e",
      E2E_PLAYWRIGHT_PID: String(process.pid),
      ADMIN_AUTH_SECRET: process.env.ADMIN_AUTH_SECRET || "playwright-admin-secret",
      SITE_URL: process.env.SITE_URL || e2eBaseUrl,
      NEXT_PUBLIC_E2E_SKIP_PAYMENT_REDIRECT:
        process.env.NEXT_PUBLIC_E2E_SKIP_PAYMENT_REDIRECT || "1",
      NEXT_PUBLIC_YANDEX_METRICA_ID:
        process.env.E2E_ENABLE_ANALYTICS === "1"
          ? process.env.NEXT_PUBLIC_YANDEX_METRICA_ID || "112256127"
          : "",
      YOOKASSA_E2E_MOCK: process.env.YOOKASSA_E2E_MOCK || "1",
      PRISMA_QUERY_LOGGING: "0",
    },
  },
  projects: [
    {
      name: "chrome",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
      },
    },
  ],
});
