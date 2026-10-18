import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

export default async function stopE2EServer() {
  const rawPort = process.env.E2E_PORT?.trim();
  const port = rawPort ? Number.parseInt(rawPort, 10) : 3100;

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("E2E_PORT must be an integer between 1 and 65535.");
  }

  const tempDir = path.resolve(".codex-tmp");
  const pidFile = path.join(tempDir, `e2e-server-${port}.pid`);
  const stopFile = path.join(tempDir, `e2e-server-${port}.stop`);

  let serverPid;
  try {
    serverPid = Number.parseInt(await readFile(pidFile, "utf8"), 10);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  if (!Number.isInteger(serverPid) || serverPid <= 0) {
    throw new Error(`Invalid E2E server PID in ${pidFile}.`);
  }

  await writeFile(stopFile, "stop\n", "utf8");

  const deadline = Date.now() + 15_000;
  while (processExists(serverPid) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (processExists(serverPid)) {
    throw new Error(`E2E server PID ${serverPid} did not stop within 15 seconds.`);
  }

  await Promise.all([
    rm(pidFile, { force: true }),
    rm(stopFile, { force: true }),
  ]);

  // Let the command shell observe the child exit before Playwright tears down its webServer plugin.
  await new Promise((resolve) => setTimeout(resolve, 200));
}
