import { spawn } from "node:child_process";
import path from "node:path";
import "dotenv/config";

const e2eDatabaseUrl = process.env.E2E_DATABASE_URL?.trim();

if (!e2eDatabaseUrl) {
  throw new Error(
    "E2E_DATABASE_URL is required. Point it to a disposable database whose host or database name contains 'test' or 'e2e'."
  );
}

let parsedDatabaseUrl;

try {
  parsedDatabaseUrl = new URL(e2eDatabaseUrl);
} catch {
  throw new Error("E2E_DATABASE_URL must be a valid PostgreSQL connection URL.");
}

if (parsedDatabaseUrl.protocol !== "postgres:" && parsedDatabaseUrl.protocol !== "postgresql:") {
  throw new Error("E2E_DATABASE_URL must use the postgres or postgresql protocol.");
}

const databaseIdentity = `${parsedDatabaseUrl.hostname}/${decodeURIComponent(parsedDatabaseUrl.pathname)}`;
const hasTestMarker = /(^|[-_./])(test|testing|e2e)([-_./]|$)/i.test(databaseIdentity);

if (!hasTestMarker) {
  throw new Error(
    "Refusing to prepare E2E data: the E2E_DATABASE_URL host or database name must contain a distinct 'test' or 'e2e' marker."
  );
}

const rawE2EPort = process.env.E2E_PORT?.trim();
const parsedE2EPort = Number.parseInt(rawE2EPort ?? "", 10);

if (
  rawE2EPort &&
  (!Number.isInteger(parsedE2EPort) || parsedE2EPort < 1 || parsedE2EPort > 65_535)
) {
  throw new Error("E2E_PORT must be an integer between 1 and 65535.");
}

const e2ePort = rawE2EPort ? parsedE2EPort : 3100;
const serverUrl = `http://127.0.0.1:${e2ePort}`;

const childEnv = {
  ...process.env,
  DATABASE_URL: e2eDatabaseUrl,
  E2E_PORT: String(e2ePort),
  ADMIN_AUTH_SECRET: process.env.ADMIN_AUTH_SECRET || "playwright-admin-secret",
  SITE_URL: serverUrl,
  NEXT_PUBLIC_SITE_URL: serverUrl,
  NEXT_PUBLIC_E2E_SKIP_PAYMENT_REDIRECT:
    "1",
  YOOKASSA_E2E_MOCK: "1",
  YOOKASSA_SHOP_ID: "isolated-e2e-shop",
  YOOKASSA_SECRET_KEY: "isolated-e2e-not-a-provider-key",
  PRISMA_QUERY_LOGGING: "0",
  TEMPLATE_DEMO_DATABASE: "seedshop-template-demo",
  TEMPLATE_E2E_SETUP: "1",
  RESEND_API_KEY: "",
  EMAIL_FROM: "",
  TELEGRAM_BOT_TOKEN: "",
  TELEGRAM_SELLER_CHAT_ID: "",
};

function run(command, args, { shell = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: childEnv,
      shell,
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} stopped with ${signal}.`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code ?? 1}.`));
        return;
      }

      resolve();
    });
  });
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const playwrightCliPath = path.resolve("node_modules", "@playwright", "test", "cli.js");

function runNpm(args) {
  if (process.platform === "win32") {
    const command = [npmCommand, ...args].join(" ");
    return run(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command]);
  }

  return run(npmCommand, args);
}

await runNpm(["run", "prisma:deploy"]);
await runNpm(["run", "prisma:seed"]);
await run(process.execPath, [playwrightCliPath, "test", ...process.argv.slice(2)]);
