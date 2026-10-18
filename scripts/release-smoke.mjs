// Anonymous GETs only. No credentials, signup, guest creation, cleanup or writes.
const raw = process.argv[2] || "https://rreviewroom.vercel.app",
  base = new URL(raw);
if (
  (base.protocol !== "https:" &&
    !(
      base.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(base.hostname)
    )) ||
  base.username ||
  base.password ||
  base.search ||
  base.hash ||
  base.pathname !== "/"
)
  throw new Error(
    "Use an HTTPS origin or a loopback HTTP origin without credentials.",
  );
const expected = "https://rreviewroom.vercel.app";
let failures = 0;
async function check(name, path, verify) {
  try {
    const response = await fetch(new URL(path, base), {
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
      headers: { "Cache-Control": "no-cache" },
    });
    const body = await response.text();
    if (!verify(response, body)) throw new Error("Check failed");
    console.log(`PASS ${name}`);
  } catch {
    failures++;
    console.error(`FAIL ${name}`);
  }
}
await check(
  "landing links to demo and canonical production URL",
  "/",
  (r, b) =>
    r.status === 200 &&
    b.includes('href="/demo"') &&
    b.includes(`rel="canonical" href="${expected}"`) &&
    !/name="robots" content="[^"]*noindex/.test(b),
);
await check(
  "social preview, icons and WebSite identity are discoverable",
  "/",
  (r, b) => {
    const match = b.match(
      /<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/s,
    );
    if (!match) return false;
    const site = JSON.parse(match[1]);
    return (
      r.status === 200 &&
      site["@type"] === "WebSite" &&
      site.name === "Review Room" &&
      site.url === expected &&
      b.includes(
        `property="og:image" content="${expected}/brand/social-preview.png"`,
      ) &&
      b.includes('name="twitter:card" content="summary_large_image"') &&
      b.includes('rel="apple-touch-icon"') &&
      b.includes('href="/favicon.ico') &&
      b.includes('href="/site.webmanifest"')
    );
  },
);
for (const path of [
  "/favicon.ico",
  "/icon.svg",
  "/apple-icon.png",
  "/brand/social-preview.png",
])
  await check(
    `${path} is a public image`,
    path,
    (r) =>
      r.status === 200 && r.headers.get("content-type")?.startsWith("image/"),
  );
await check(
  "home-screen identity uses the Review Room icons",
  "/site.webmanifest",
  (r, b) => {
    const manifest = JSON.parse(b);
    return (
      r.status === 200 &&
      manifest.name === "Review Room" &&
      manifest.display === "browser" &&
      manifest.icons?.length === 2 &&
      manifest.icons.every((i) => i.src.startsWith("/brand/icon-"))
    );
  },
);
await check(
  "robots exclude private routes",
  "/robots.txt",
  (r, b) =>
    r.status === 200 &&
    ["/app", "/auth", "/api", "/invite", "/share", "/demo"].every((p) =>
      b.includes(`Disallow: ${p}`),
    ) &&
    b.includes(`${expected}/sitemap.xml`),
);
await check(
  "sitemap contains only the public landing page",
  "/sitemap.xml",
  (r, b) =>
    r.status === 200 &&
    (b.match(/<loc>/g) || []).length === 1 &&
    b.includes(`<loc>${expected}</loc>`),
);
for (const path of ["/login", "/signup", "/invite", "/share", "/demo"])
  await check(
    `${path} is noindex and no-referrer`,
    path,
    (r) =>
      r.status === 200 &&
      r.headers.get("x-robots-tag")?.includes("noindex") &&
      r.headers.get("referrer-policy") === "no-referrer",
  );
await check(
  "anonymous workspace access redirects to login",
  "/app",
  (r) =>
    [303, 307, 308].includes(r.status) &&
    new URL(r.headers.get("location"), base).pathname === "/login",
);
await check(
  "anonymous demo state denied without creating a session",
  "/demo/state",
  (r) =>
    r.status === 410 && r.headers.get("cache-control")?.includes("no-store"),
);
await check(
  "maintenance rejects anonymous requests",
  "/api/maintenance",
  (r) =>
    r.status === 401 && r.headers.get("cache-control")?.includes("no-store"),
);
if (failures) {
  console.error(
    `${failures} release checks failed. No state-changing requests were sent.`,
  );
  process.exitCode = 1;
} else
  console.log(
    "Read-only release checks passed. Authenticated uploads/decisions, a physical phone and Google consent remain manual.",
  );
