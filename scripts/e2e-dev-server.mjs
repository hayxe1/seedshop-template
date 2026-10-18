import { createServer } from "node:http";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";

const hostname = "127.0.0.1";
const rawPort = process.env.E2E_PORT?.trim();
const port = rawPort ? Number.parseInt(rawPort, 10) : 3100;
const playwrightPid = Number.parseInt(process.env.E2E_PLAYWRIGHT_PID ?? "", 10);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("E2E_PORT must be an integer between 1 and 65535.");
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = path.join(projectRoot, ".codex-tmp");
const pidFile = path.join(tempDir, `e2e-server-${port}.pid`);
const stopFile = path.join(tempDir, `e2e-server-${port}.stop`);
const tsconfigFile = path.join(projectRoot, "tsconfig.json");
const nextEnvFile = path.join(projectRoot, "next-env.d.ts");
const originalTsconfig = await readFile(tsconfigFile, "utf8");
const originalNextEnv = await readFile(nextEnvFile, "utf8");

await mkdir(tempDir, { recursive: true });
await Promise.all([
  rm(pidFile, { force: true }),
  rm(stopFile, { force: true }),
]);
await writeFile(pidFile, String(process.pid), "utf8");

const app = next({
  dev: true,
  dir: projectRoot,
  hostname,
  port,
  turbopack: true,
});
const handle = app.getRequestHandler();
let server;
let stopping = false;
let stopPoll;
let parentPoll;

function isOnlyNextTsconfigMutation(currentText) {
  try {
    const original = JSON.parse(originalTsconfig);
    const current = JSON.parse(currentText);
    const generatedIncludes = new Set([
      ".codex-tmp/next-e2e/types/**/*.ts",
      ".codex-tmp/next-e2e/dev/types/**/*.ts",
    ]);

    if (Array.isArray(current.include)) {
      current.include = current.include.filter((entry) => !generatedIncludes.has(entry));
    }

    return JSON.stringify(current) === JSON.stringify(original);
  } catch {
    return false;
  }
}

function withoutRouteTypeReference(text) {
  return text.replace(/^import ["'][^"']*\/types\/(routes|root-params)\.d\.ts["'];\r?$/gm, "<route-types:$1>");
}

async function restoreNextGeneratedFiles() {
  const [currentTsconfig, currentNextEnv] = await Promise.all([
    readFile(tsconfigFile, "utf8"),
    readFile(nextEnvFile, "utf8"),
  ]);

  const restorations = [];
  if (currentTsconfig !== originalTsconfig && isOnlyNextTsconfigMutation(currentTsconfig)) {
    restorations.push(writeFile(tsconfigFile, originalTsconfig, "utf8"));
  }
  if (
    currentNextEnv !== originalNextEnv &&
    withoutRouteTypeReference(currentNextEnv) === withoutRouteTypeReference(originalNextEnv)
  ) {
    restorations.push(writeFile(nextEnvFile, originalNextEnv, "utf8"));
  }

  await Promise.all(restorations);
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return true;

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function shutdown(reason, exitCode = 0) {
  if (stopping) return;
  stopping = true;
  clearInterval(stopPoll);
  clearInterval(parentPoll);
  console.log(`[e2e-server] stopping (${reason})`);

  const forceExit = setTimeout(() => process.exit(exitCode), 8_000);
  forceExit.unref();

  try {
    if (server?.listening) {
      server.closeIdleConnections?.();
      await new Promise((resolve) => server.close(resolve));
    }
    await app.close();
  } finally {
    await restoreNextGeneratedFiles();
    await Promise.all([
      rm(pidFile, { force: true }),
      rm(stopFile, { force: true }),
    ]);
    clearTimeout(forceExit);
  }

  process.exit(exitCode);
}

try {
  await app.prepare();
  server = createServer((request, response) => {
    void handle(request, response);
  });
  server.on("upgrade", app.getUpgradeHandler());
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, hostname, resolve);
  });

  console.log(`[e2e-server] ready at http://${hostname}:${port}`);

  stopPoll = setInterval(() => {
    void fileExists(stopFile).then((exists) => {
      if (exists) void shutdown("Playwright teardown");
    });
  }, 100);

  parentPoll = setInterval(() => {
    if (!processExists(playwrightPid)) void shutdown("Playwright process exited", 1);
  }, 500);

  process.on("SIGINT", () => void shutdown("SIGINT", 1));
  process.on("SIGTERM", () => void shutdown("SIGTERM", 1));
} catch (error) {
  await restoreNextGeneratedFiles();
  await Promise.all([
    rm(pidFile, { force: true }),
    rm(stopFile, { force: true }),
  ]);
  throw error;
}
