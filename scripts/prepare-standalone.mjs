import { access, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextRoot = path.join(projectRoot, ".next");
const standaloneRoot = path.join(nextRoot, "standalone");
const serverFile = path.join(standaloneRoot, "server.js");

async function assertExists(target, description) {
  try {
    await access(target);
  } catch {
    throw new Error(`${description} not found at ${target}. Run npm run build first.`);
  }
}

await assertExists(serverFile, "Standalone server");
await assertExists(path.join(projectRoot, "public"), "Public directory");
await assertExists(path.join(nextRoot, "static"), "Next.js static assets");

const standalonePublic = path.join(standaloneRoot, "public");
const standaloneStatic = path.join(standaloneRoot, ".next", "static");

await rm(standalonePublic, { recursive: true, force: true });
await rm(standaloneStatic, { recursive: true, force: true });
await mkdir(path.dirname(standaloneStatic), { recursive: true });
await cp(path.join(projectRoot, "public"), standalonePublic, { recursive: true });
await cp(path.join(nextRoot, "static"), standaloneStatic, { recursive: true });

console.log(`Standalone artifact prepared at ${standaloneRoot}`);
