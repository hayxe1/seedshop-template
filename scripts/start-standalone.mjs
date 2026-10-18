import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneRoot = path.join(projectRoot, ".next", "standalone");

const prepare = spawn(process.execPath, [path.join(projectRoot, "scripts", "prepare-standalone.mjs")], {
  cwd: projectRoot,
  env: process.env,
  stdio: "inherit",
});

prepare.on("exit", (code, signal) => {
  if (signal || code !== 0) {
    process.exitCode = code ?? 1;
    return;
  }

  const server = spawn(process.execPath, ["server.js"], {
    cwd: standaloneRoot,
    env: process.env,
    stdio: "inherit",
  });

  const forward = (signalName) => {
    if (!server.killed) {
      server.kill(signalName);
    }
  };

  process.once("SIGINT", () => forward("SIGINT"));
  process.once("SIGTERM", () => forward("SIGTERM"));
  server.on("exit", (serverCode, serverSignal) => {
    if (serverSignal) {
      process.kill(process.pid, serverSignal);
      return;
    }
    process.exitCode = serverCode ?? 1;
  });
});
