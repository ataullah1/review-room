// Capture the real UI with local, seeded demo responses. Never writes to a backend.
import { spawn } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { seededDemo } from "../src/features/demo/state.ts";

const origin = new URL(process.argv[2] || "http://localhost:3001");
if (
  origin.protocol !== "http:" ||
  !["localhost", "127.0.0.1"].includes(origin.hostname) ||
  origin.username ||
  origin.password ||
  origin.search ||
  origin.hash ||
  origin.pathname !== "/"
)
  throw new Error(
    "Use a loopback HTTP origin, for example http://localhost:3001.",
  );

const output = "docs/screenshots";
const folder = await mkdtemp(join(tmpdir(), "review-room-portfolio-"));
const profile = join(folder, "chrome");
let chrome;
let socket;
const pending = new Map();
let sequence = 0;
let interceptedSessions = 0;
let captureError;

function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Browser command timed out: ${method}`));
    }, 15000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const response = await command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) throw new Error("Browser evaluation failed.");
  return response.result.value;
}

async function waitFor(expression) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (captureError) throw captureError;
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`UI did not become ready: ${expression}`);
}

async function click(selector) {
  await waitFor(
    `(() => { const element = document.querySelector(${JSON.stringify(selector)}); return element && !element.disabled; })()`,
  );
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
}

async function viewport(width, height) {
  await command("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 700,
  });
}

async function capture(name) {
  await evaluate("document.fonts.ready");
  await evaluate(
    '[...document.images].forEach(image => image.loading = "eager")',
  );
  await waitFor(
    "[...document.images].every(image => image.complete && image.naturalWidth > 0)",
  );
  await evaluate(
    "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
  );
  if (await evaluate("document.documentElement.scrollWidth > innerWidth"))
    throw new Error(`Horizontal overflow in ${name}`);
  const shot = await command("Page.captureScreenshot", { format: "png" });
  await sharp(Buffer.from(shot.data, "base64"))
    .webp({ quality: 88 })
    .toFile(join(output, `${name}.webp`));
  console.log(`Captured ${name}`);
}

// Only these two read-only visual fixtures are simulated. No app API is called.
let snapshot = {
  view: "DESIGNER",
  state: seededDemo(),
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
  generation: 0,
  commentCount: 0,
  actionCount: 0,
};
async function intercept({ requestId, request }) {
  const url = new URL(request.url);
  if (url.origin !== origin.origin) {
    await command("Fetch.failRequest", {
      requestId,
      errorReason: "BlockedByClient",
    });
    throw new Error("Capture attempted to load an external resource.");
  }
  // Next may prefetch the landing page's workspace link. Never forward it.
  if (request.method === "GET" && url.pathname === "/app") {
    await command("Fetch.fulfillRequest", { requestId, responseCode: 204 });
    return;
  }
  const isSession =
    url.pathname === "/demo/session" && request.method === "POST";
  const isView = url.pathname === "/demo/state" && request.method === "POST";
  if (isSession || isView) {
    if (isSession) interceptedSessions++;
    if (isView) {
      const action = JSON.parse(request.postData || "{}");
      if (
        action.operation !== "view" ||
        !["CLIENT", "DESIGNER"].includes(action.view)
      ) {
        await command("Fetch.failRequest", {
          requestId,
          errorReason: "BlockedByClient",
        });
        throw new Error("Only demo view switching is allowed during capture.");
      }
      snapshot = {
        ...snapshot,
        view: action.view,
        actionCount: snapshot.actionCount + 1,
      };
    }
    await command("Fetch.fulfillRequest", {
      requestId,
      responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      body: Buffer.from(JSON.stringify(snapshot)).toString("base64"),
    });
    return;
  }
  const publicGet =
    request.method === "GET" &&
    (["/", "/demo", "/signup", "/login"].includes(url.pathname) ||
      url.pathname.startsWith("/_next/") ||
      url.pathname.startsWith("/fonts/") ||
      url.pathname.startsWith("/brand/") ||
      /^\/demo\/[a-z]+-v[12]\.svg$/.test(url.pathname) ||
      [
        "/favicon.ico",
        "/icon.svg",
        "/apple-icon.png",
        "/site.webmanifest",
      ].includes(url.pathname));
  if (!publicGet) {
    await command("Fetch.failRequest", {
      requestId,
      errorReason: "BlockedByClient",
    });
    throw new Error(`Capture blocked ${request.method} ${url.pathname}.`);
  }
  await command("Fetch.continueRequest", { requestId });
}

try {
  await access(output + "/README.md");
  await mkdir(profile);
  chrome = spawn(
    process.env.CHROME_BIN ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    [
      "--headless",
      "--disable-gpu",
      "--no-first-run",
      "--disable-extensions",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  chrome.on("error", (error) => {
    captureError = error;
  });
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (captureError) throw captureError;
    try {
      port = (
        await readFile(join(profile, "DevToolsActivePort"), "utf8")
      ).split("\n")[0];
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  if (!port)
    throw new Error("Chrome could not start; set CHROME_BIN if needed.");
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  socket = new WebSocket(
    targets.find((target) => target.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
    if (message.method === "Fetch.requestPaused")
      void intercept(message.params).catch((error) => {
        captureError = error;
      });
  };
  await command("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  await viewport(1440, 1440);
  await command("Page.navigate", { url: origin.href });
  await waitFor("!!document.querySelector('#home-intro')");
  await capture("01-landing");
  await viewport(1600, 1320);
  await command("Page.navigate", { url: new URL("/demo", origin).href });
  await waitFor(
    "document.querySelectorAll('.demo-assets button').length === 3",
  );
  await click(".demo-thread-heading");
  await capture("02-pinned-feedback");
  await click(".demo-review-heading button");
  await waitFor("!!document.querySelector('.demo-comparison')");
  await capture("03-version-comparison");
  await click(".demo-review-heading button");
  await click(".demo-assets button:nth-child(2)");
  await click(".demo-view-toggle button:nth-child(2)");
  await waitFor(
    "document.querySelector('.demo-view-toggle button:nth-child(2)').getAttribute('aria-pressed') === 'true'",
  );
  await waitFor(
    "document.querySelector('.demo-decision').textContent.includes('Approved by demo client')",
  );
  await capture("04-client-review");
  await click(".demo-view-toggle button:first-child");
  await waitFor(
    "document.querySelector('.demo-view-toggle button:first-child').getAttribute('aria-pressed') === 'true'",
  );
  await click(".demo-assets button:first-child");
  await click(".demo-thread-heading");
  await viewport(390, 1120);
  await evaluate(
    "document.querySelector('.demo-review-layout').scrollIntoView({block: 'start'})",
  );
  await capture("05-mobile-feedback");
  if (captureError) throw captureError;
  if (interceptedSessions !== 1)
    throw new Error("Expected exactly one intercepted demo start.");
  const files = [
    "01-landing",
    "02-pinned-feedback",
    "03-version-comparison",
    "04-client-review",
    "05-mobile-feedback",
  ];
  await writeFile(
    join(output, "capture.json"),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        source: "Local production UI with intercepted seeded demo responses",
        backendWrites: false,
        images: files.map((file) => `${file}.webp`),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Five portfolio screenshots saved. Demo responses were intercepted; no production data or sessions were created.",
  );
} finally {
  socket?.close();
  chrome?.kill();
  await new Promise((resolve) => setTimeout(resolve, 250));
  await rm(folder, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 200,
  });
}
