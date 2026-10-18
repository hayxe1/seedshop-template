import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.STANDALONE_SMOKE_PORT ?? 3101);
const origin = `http://127.0.0.1:${port}`;
const checkedResources = [];

async function waitForServer(timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) return;
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Standalone server did not become ready at ${origin}`);
}

async function assertResource(resourcePath, expectedType) {
  const response = await fetch(new URL(resourcePath, origin));
  if (!response.ok) {
    throw new Error(`${resourcePath} returned ${response.status}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (expectedType && !contentType.includes(expectedType)) {
    throw new Error(`${resourcePath} returned unexpected MIME type ${contentType}`);
  }
  checkedResources.push(`${response.status} ${contentType || "unknown"} ${resourcePath}`);
  return response;
}

const server = spawn(process.execPath, [path.join(projectRoot, "scripts", "start-standalone.mjs")], {
  cwd: projectRoot,
  env: { ...process.env, HOSTNAME: "127.0.0.1", PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverLogs = "";
server.stdout.on("data", (chunk) => {
  serverLogs += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverLogs += chunk.toString();
});

let browser;
try {
  await waitForServer();

  const homeResponse = await assertResource("/", "text/html");
  await assertResource("/catalog", "text/html");
  await assertResource("/sets", "text/html");
  await assertResource("/api/health", "application/json");

  const html = await homeResponse.text();
  const staticUrls = [...html.matchAll(/(?:src|href)="([^"?]+\.(?:css|js))(?:\?[^\"]*)?"/g)].map(
    (match) => match[1],
  );
  const cssUrl = staticUrls.find((url) => url.endsWith(".css"));
  const jsUrl = staticUrls.find((url) => url.endsWith(".js"));
  if (!cssUrl || !jsUrl) {
    throw new Error("Home page did not expose both CSS and JS asset URLs");
  }
  await assertResource(cssUrl, "text/css");
  await assertResource(jsUrl, "javascript");

  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      browserErrors.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => {
    const errorText = request.failure()?.errorText ?? "unknown";
    const isCancelledPrefetch = errorText.includes("ERR_ABORTED") && request.url().includes("_rsc=");
    if (!isCancelledPrefetch) {
      browserErrors.push(`requestfailed: ${request.url()} (${errorText})`);
    }
  });

  for (const route of ["/", "/catalog", "/sets"]) {
    const response = await page.goto(`${origin}${route}`, { waitUntil: "networkidle" });
    if (!response?.ok()) throw new Error(`${route} returned ${response?.status() ?? "no response"} in Chrome`);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(350);
  }

  const firstImageUrl = await page.locator("img").first().getAttribute("src");
  if (!firstImageUrl) throw new Error("Rendered pages did not expose an image to smoke-test");
  await assertResource(firstImageUrl, "image/");

  if (browserErrors.length > 0) {
    throw new Error(`Browser resource smoke found errors:\n${browserErrors.join("\n")}`);
  }

  console.log("Standalone production smoke passed:");
  for (const line of checkedResources) console.log(`  ${line}`);
} catch (error) {
  if (serverLogs.trim()) console.error(serverLogs.trim());
  throw error;
} finally {
  await browser?.close();
  if (!server.killed && server.exitCode === null) server.kill("SIGTERM");
  if (server.exitCode === null) {
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 3_000);
      server.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
}
