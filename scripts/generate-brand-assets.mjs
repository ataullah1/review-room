// Local artwork generation only: no network, Supabase, credentials or database.
// Run with pnpm brand:generate; Chrome is required only for this optional command.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";
import { BrandMark, Brand } from "../src/components/brand.tsx";

await mkdir("public/brand", { recursive: true });
const mark = renderToStaticMarkup(
  createElement(BrandMark, { size: 48, decorative: false }),
);
await writeFile("public/brand/mark.svg", mark + "\n");
await writeFile("src/app/icon.svg", mark + "\n");
for (const size of [64, 192, 512])
  await sharp(Buffer.from(mark))
    .resize(size, size)
    .flatten({ background: "#59734d" })
    .png()
    .toFile(`public/brand/icon-${size}.png`);
await sharp(Buffer.from(mark))
  .resize(180, 180)
  .flatten({ background: "#59734d" })
  .png()
  .toFile("src/app/apple-icon.png");
const sizes = [16, 32, 48, 64],
  pngs = await Promise.all(
    sizes.map((size) =>
      sharp(Buffer.from(mark)).resize(size, size).png().toBuffer(),
    ),
  );
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (let i = 0; i < sizes.length; i++) {
  const at = 6 + i * 16;
  header[at] = sizes[i];
  header[at + 1] = sizes[i];
  header.writeUInt16LE(1, at + 4);
  header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(pngs[i].length, at + 8);
  header.writeUInt32LE(offset, at + 12);
  offset += pngs[i].length;
}
await writeFile("src/app/favicon.ico", Buffer.concat([header, ...pngs]));

const font = (
  await readFile("public/fonts/manrope-latin-variable.woff2")
).toString("base64");
const sample = (
  await sharp(await readFile("public/demo/identity-v2.svg"))
    .resize(716, 478)
    .png()
    .toBuffer()
).toString("base64");
const lockup = renderToStaticMarkup(createElement(Brand));
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><style>
@font-face{font-family:Manrope;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:200 800}
${await readFile("src/components/brand.css", "utf8")}
*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;overflow:hidden;background:#f7f6ef;color:#25342d;font-family:Manrope,Arial,sans-serif}
.header{position:absolute;inset:48px 62px auto;display:flex;justify-content:space-between;align-items:center}.header .rr-brand{font-size:26px;gap:12px}.header .rr-brand__mark{width:42px;height:42px}
.eyebrow{color:#59734d;font-size:11px;letter-spacing:2px;font-weight:700}.headline{position:absolute;left:62px;top:170px;margin:0;font-size:58px;line-height:1.18;letter-spacing:-2.8px;font-weight:750}.headline span{color:#59734d}
.description{position:absolute;left:65px;top:346px;font-size:19px;line-height:1.85;color:#657267;margin:0}.footer{position:absolute;left:65px;bottom:44px;color:#59734d;font-size:14px;font-weight:600}.footer span{margin-left:20px;padding-left:20px;border-left:1px solid #cbd4c1;color:#657267;font-size:12px;font-weight:500}
.orbit{position:absolute;width:680px;height:680px;border:1px solid #dfe5d6;border-radius:50%;left:680px;top:112px}.orbit:after{content:'';position:absolute;inset:46px;border:1px solid #e9ebdf;border-radius:50%}
.canvas{position:absolute;left:727px;top:155px;width:403px;background:#fff;border:1px solid #dce3d4;border-radius:16px;padding:0 18px 14px;box-shadow:0 15px 45px #25342d0b;transform:rotate(3deg)}.canvas-head{height:48px;display:flex;align-items:center;justify-content:space-between;font-size:10px;color:#657267;font-weight:600}.canvas-head div{display:flex;gap:5px}.canvas-head i{width:6px;height:6px;border-radius:50%;background:#d9dfd1}.art{position:relative}.art img{width:100%;display:block;border-radius:7px}.pin{position:absolute;left:50%;top:56%;width:29px;height:29px;border-radius:50% 50% 50% 4px;background:#59734d;border:3px solid #fff;color:#fff;display:grid;place-items:center;font-size:12px;box-shadow:0 3px 7px #25342d26;transform:translate(-50%,-50%)}.canvas-foot{display:flex;justify-content:space-between;align-items:center;padding-top:14px;font-size:11px;color:#657267}.status{padding:5px 9px;border-radius:20px;background:#eef3e8;color:#59734d;font-size:10px}
.comment{position:absolute;left:675px;top:451px;width:455px;padding:20px 22px;display:flex;gap:15px;align-items:center;background:#fff;border:1px solid #dce3d4;border-radius:13px;box-shadow:0 13px 35px #25342d0b}.number{background:#eef3e8;color:#59734d;border-radius:9px;width:34px;height:34px;display:grid;place-items:center;font-weight:700;font-size:12px}.comment strong{display:block;font-size:15px;font-weight:700;letter-spacing:-.2px}.comment small{display:block;font-size:10px;color:#657267;margin-top:5px;letter-spacing:.2px}
</style><div class="orbit"></div><header class="header">${lockup}<div class="eyebrow">A LITTLE SPACE FOR BETTER FEEDBACK</div></header><h1 class="headline">A little feedback.<br><span>A better result.</span></h1><p class="description">Pin a thought. Compare a version.<br>Move the work forward.</p><section class="canvas"><div class="canvas-head"><div><i></i><i></i><i></i></div><span>FORMA / SAMPLE DESIGN</span></div><div class="art"><img alt="Original fictional sample artwork" src="data:image/png;base64,${sample}"><span class="pin">1</span></div><div class="canvas-foot"><span>Version 2</span><span class="status">Review required</span></div></section><aside class="comment"><span class="number">01</span><div><strong>Give every thought a place.</strong><small>PINNED FEEDBACK · VERSION COMPARISON · CLIENT APPROVAL</small></div></aside><footer class="footer">rreviewroom.vercel.app<span>Visual review & client approval</span></footer></html>`;
const folder = await mkdtemp(join(tmpdir(), "review-room-brand-")),
  profile = join(folder, "chrome");
let chrome, ws;
try {
  await mkdir(profile);
  await writeFile(join(folder, "social.html"), html);
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
  chrome.on("error", () => {});
  let port;
  for (let i = 0; i < 100; i++) {
    try {
      port = (
        await readFile(join(profile, "DevToolsActivePort"), "utf8")
      ).split("\n")[0];
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  if (!port)
    throw new Error(
      "Chrome could not start. Set CHROME_BIN to an installed Chrome executable.",
    );
  const target = (
    await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  ).find((t) => t.type === "page");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let sequence = 0;
  const callbacks = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (callbacks.has(m.id)) {
      callbacks.get(m.id)(m);
      callbacks.delete(m.id);
    }
  };
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence,
        t = setTimeout(() => {
          callbacks.delete(id);
          reject(new Error("Artwork render timeout"));
        }, 15000);
      callbacks.set(id, (m) => {
        clearTimeout(t);
        if (m.error) reject(new Error("Artwork render command failed"));
        else resolve(m.result);
      });
      ws.send(JSON.stringify({ id, method, params }));
    });
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1200,
    height: 630,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call("Page.navigate", {
    url: "file://" + resolve(folder, "social.html"),
  });
  for (let i = 0; i < 100; i++) {
    const r = await call("Runtime.evaluate", {
      expression:
        'document.readyState==="complete"&&document.fonts.status==="loaded"&&document.images.length===1&&document.images[0].complete',
      returnByValue: true,
    });
    if (r.result.value) break;
    if (i === 99) throw new Error("Artwork/fonts did not load");
    await new Promise((r) => setTimeout(r, 100));
  }
  const shot = await call("Page.captureScreenshot", { format: "png" });
  await sharp(Buffer.from(shot.data, "base64"))
    .png({ compressionLevel: 9 })
    .toFile("public/brand/social-preview.png");
  console.log(
    "Generated original SVG mark, 16/32/48/64 ICO, Apple/PWA icons and 1200×630 social card. No runtime/build Chrome dependency.",
  );
} finally {
  ws?.close();
  chrome?.kill();
  await new Promise((r) => setTimeout(r, 200));
  await rm(folder, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 200,
  });
}
