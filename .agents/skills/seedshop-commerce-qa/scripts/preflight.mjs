import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

const root = path.resolve(process.argv[2] || process.cwd());
const checks = [];
const add = (name, ok) => checks.push({ name, ok: Boolean(ok) });
const file = (name) => path.join(root, name);
let pkg;
try { pkg = JSON.parse(readFileSync(file("package.json"), "utf8")); } catch {}
if (pkg?.name !== "seedshop-template") {
  console.log(JSON.stringify({ ready: false, reason: "Run from seedshop-template root or pass its path." }));
  process.exit(2);
}
add("node_22_or_newer", Number(process.versions.node.split(".")[0]) >= 22);
for (const name of ["README.md", "DESIGN.md", "playwright.config.ts", "scripts/run-e2e-suite.mjs", "node_modules/@playwright/test/cli.js", "node_modules/next/dist/docs/index.md"]) add(name, existsSync(file(name)));
const chromeRoots = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean);
add("chrome_executable", chromeRoots.some(base => existsSync(path.join(base, "Google/Chrome/Application/chrome.exe"))));
let localEnv = {};
let envReadable = true;
try { if (existsSync(file(".env"))) localEnv = parseEnv(readFileSync(file(".env"), "utf8")); } catch { envReadable = false; }
add("env_parseable", envReadable);
const env = { ...localEnv, ...process.env };
let testUrl, appUrl;
try { testUrl = new URL(env.E2E_DATABASE_URL || ""); } catch {}
try { appUrl = new URL(env.DATABASE_URL || ""); } catch {}
const loopbacks = new Set(["127.0.0.1", "localhost", "[::1]"]);
let testName = "", appName = "";
try { testName = decodeURIComponent(testUrl?.pathname.slice(1) || ""); appName = decodeURIComponent(appUrl?.pathname.slice(1) || ""); } catch {}
add("e2e_postgres_url", testUrl && ["postgres:", "postgresql:"].includes(testUrl.protocol));
add("e2e_loopback", testUrl && loopbacks.has(testUrl.hostname));
add("e2e_database_marker", /(^|_)(e2e|test)(_|$)/i.test(testName));
const sameHost = testUrl && appUrl && (testUrl.hostname === appUrl.hostname || (loopbacks.has(testUrl.hostname) && loopbacks.has(appUrl.hostname)));
const sameDatabase = sameHost && (testUrl.port || "5432") === (appUrl.port || "5432") && testName === appName;
add("e2e_separate_from_app_database", testUrl && !sameDatabase);
if (env.E2E_PORT) add("e2e_port", /^\d+$/.test(env.E2E_PORT) && Number(env.E2E_PORT) >= 1 && Number(env.E2E_PORT) <= 65535);
const ready = checks.every(check => check.ok);
console.log(JSON.stringify({ ready, checks, limits: "No connections, migrations, seed or provider calls performed. Database ownership, availability, collation and test results remain unverified." }, null, 2));
process.exitCode = ready ? 0 : 2;
