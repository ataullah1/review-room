import { config } from "dotenv";
config({ path: ".env", quiet: true });
// The old test project is now production: refuse all hosted fixture writes there.
import { assertHostedTestTarget } from "../src/lib/config/deployment.ts";
assertHostedTestTarget();
import { createRequire } from "node:module";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url),
  { Client } = require("pg"),
  sharp = require("sharp");
const dbUrl = new URL(process.env.DIRECT_URL);
dbUrl.searchParams.delete("schema");
dbUrl.searchParams.delete("pgbouncer");
const db = new Client({
  connectionString: dbUrl.toString(),
  connectionTimeoutMillis: 20000,
  query_timeout: 20000,
});
await db.connect();
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL,
  secret = process.env.SUPABASE_SECRET_KEY,
  bucket = process.env.SUPABASE_STORAGE_BUCKET;
const users = [],
  workspaceId = randomUUID(),
  projectId = randomUUID(),
  objects = new Set();
let chrome, ws;
const hash = (v) => createHash("sha256").update(v).digest("hex");
const admin = async (path, method, body) =>
  fetch(supabase + "/auth/v1/admin/" + path, {
    method,
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
const storage = async (path, method, body) =>
  fetch(supabase + "/storage/v1/" + path, {
    method,
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
async function account(role) {
  const email = `step10-${randomUUID()}@example.test`,
    password = randomBytes(24).toString("hex"),
    permit = randomBytes(32).toString("hex");
  await db.query(
    'INSERT INTO app."SignupPermit" ("tokenHash","emailHash","expiresAt") VALUES ($1,$2,NOW()+INTERVAL \'5 minutes\')',
    [hash(permit), hash(email)],
  );
  try {
    const r = await admin("users", "POST", {
        email,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: `Comment test ${role.toLowerCase()}`,
          signup_permit: permit,
        },
      }),
      data = await r.json();
    if (!r.ok) throw new Error("Test account setup failed " + r.status);
    const user = { id: data.id, email, password, role };
    users.push(user);
    await db.query(
      'INSERT INTO app."UserProfile" (id,"displayName") VALUES ($1,$2)',
      [user.id, `Comment test ${role.toLowerCase()}`],
    );
    return user;
  } finally {
    await db.query('DELETE FROM app."SignupPermit" WHERE "tokenHash"=$1', [
      hash(permit),
    ]);
  }
}
function cookiesFrom(response) {
  return response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}
const origin = "http://localhost:3000";
async function login(user) {
  const r = await fetch(origin + "/auth/login", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password: user.password }),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error("App login failed " + r.status);
  return cookiesFrom(r);
}
const assetId = randomUUID(),
  versionId = randomUUID();
const objectKey = `${workspaceId}/${projectId}/${assetId}/${versionId}/original.png`;
const base = `/app/${workspaceId}/projects/${projectId}/assets/${assetId}`,
  endpoint = `${base}/comments?versionId=${versionId}`;
async function feedback(cookie, body) {
  const r = await fetch(origin + endpoint, {
    method: "POST",
    headers: {
      Origin: origin,
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  return { status: r.status, data: await r.json() };
}
try {
  const owner = await account("OWNER"),
    client = await account("CLIENT"),
    second = await account("CLIENT"),
    designer = await account("DESIGNER");
  await db.query(
    'INSERT INTO app."Workspace" (id,name,"createdById") VALUES ($1,$2,$3)',
    [workspaceId, "Version acceptance", owner.id],
  );
  for (const u of [owner, client, second, designer])
    await db.query(
      'INSERT INTO app."Membership" ("workspaceId","userId",role) VALUES ($1,$2,$3)',
      [workspaceId, u.id, u.role],
    );
  await db.query(
    'INSERT INTO app."Project" (id,"workspaceId",name) VALUES ($1,$2,$3)',
    [projectId, workspaceId, "Campaign version review"],
  );
  for (const u of [client, second, designer])
    await db.query(
      'INSERT INTO app."ProjectMember" ("projectId","workspaceId","userId") VALUES ($1,$2,$3)',
      [projectId, workspaceId, u.id],
    );
  const ownerCookie = await login(owner),
    clientCookie = await login(client),
    secondCookie = await login(second),
    designerCookie = await login(designer);
  const image = await sharp({
    create: { width: 3600, height: 2400, channels: 3, background: "#edf2e6" },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="1200" height="800"><rect x="120" y="110" width="960" height="580" rx="50" fill="#59734d"/><circle cx="600" cy="400" r="160" fill="#e5eddc"/></svg>',
        ),
      },
    ])
    .png()
    .toBuffer();
  await db.query(
    'INSERT INTO app."Asset" (id,"projectId","workspaceId",title) VALUES ($1,$2,$3,$4)',
    [assetId, projectId, workspaceId, "Campaign concept"],
  );
  await db.query(
    'INSERT INTO app."AssetVersion" (id,"assetId","projectId","workspaceId","versionNumber",status,"creatorId","originalName","expectedMimeType","expectedSize","mimeType","fileSize",width,height,"contentHash","stagingKey","objectKey","expiresAt","cleanupAfter") VALUES ($1,$2,$3,$4,1,\'READY\',$5,\'concept.png\',\'image/png\',$6,\'image/png\',$6,3600,2400,$7,$8,$9,NOW(),NOW())',
    [
      versionId,
      assetId,
      projectId,
      workspaceId,
      owner.id,
      image.length,
      hash(image),
      "_pending/" + randomUUID(),
      objectKey,
    ],
  );
  await db.query('UPDATE app."Asset" SET "currentVersionId"=$1 WHERE id=$2', [
    versionId,
    assetId,
  ]);
  const upload = await fetch(
    `${supabase}/storage/v1/object/${bucket}/${objectKey}`,
    {
      method: "POST",
      headers: {
        apikey: secret,
        Authorization: `Bearer ${secret}`,
        "Content-Type": "image/png",
      },
      body: image,
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!upload.ok)
    throw new Error("Fixture storage upload failed " + upload.status);
  objects.add(objectKey);
  async function decision(cookie, body) {
    const r = await fetch(origin + base + "/decisions", {
      method: "POST",
      headers: {
        Origin: origin,
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    return { status: r.status, data: await r.json() };
  }
  for (const c of [ownerCookie, designerCookie])
    if (
      (
        await decision(c, {
          id: randomUUID(),
          expectedCurrentVersionId: versionId,
          decision: "APPROVED",
        })
      ).status !== 403
    )
      throw new Error("Designer/owner decision was not denied");
  console.log("Live: owner/designer approval attempts denied 403.");
  chrome = spawn(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    [
      "--headless",
      "--disable-gpu",
      "--no-first-run",
      "--user-data-dir=/tmp/rr-step10-browser",
      "--remote-debugging-port=9251",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let targets;
  for (let n = 0; n < 50; n++) {
    try {
      targets = await (await fetch("http://127.0.0.1:9251/json")).json();
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  ws = new WebSocket(
    targets.find((t) => t.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((r) => (ws.onopen = r));
  let seq = 0;
  const callbacks = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (callbacks.has(m.id)) {
      callbacks.get(m.id)(m.result);
      callbacks.delete(m.id);
    }
  };
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq,
        t = setTimeout(() => {
          callbacks.delete(id);
          reject(new Error("Browser command timeout"));
        }, 90000);
      callbacks.set(id, (result) => {
        clearTimeout(t);
        resolve(result);
      });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails)
      throw new Error(
        "Browser evaluation failed: " +
          JSON.stringify(
            r.exceptionDetails.exception?.description ||
              r.exceptionDetails.text,
          ),
      );
    return r.result?.value;
  };
  const wait = async (expression) => {
    let retries = 0;
    for (let n = 0; n < 220; n++) {
      if (await evaluate(expression)) return;
      if (
        retries < 2 &&
        (await evaluate(
          'document.querySelector("h1")?.textContent.includes("couldn’t load")',
        ))
      ) {
        await evaluate(
          '[...document.querySelectorAll("button")].find(b=>b.textContent==="Try again")?.click();true',
        );
        retries++;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    const shot = await call("Page.captureScreenshot", { format: "png" });
    await writeFile(
      "/tmp/rr-step10-failure.png",
      Buffer.from(shot.data, "base64"),
    );
    const diagnostic = await evaluate(
      'document.querySelector(".auth-error")?.textContent?.slice(0,200)||"See local failure screenshot."',
    );
    throw new Error(
      "Browser assertion timeout: " + expression + "; UI: " + diagnostic,
    );
  };
  const text = async (selector, value) =>
    evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`,
    );
  const button = async (label) => {
    await wait(
      `(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});const handler=n=>n&&Object.keys(n).some(k=>k.startsWith('__reactProps')&&(typeof n[k].onClick==='function'||typeof n[k].onSubmit==='function'));return b&&!b.disabled&&(handler(b)||handler(b.closest('form')));})()`,
    );
    return evaluate(
      `([...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)})).click();true`,
    );
  };
  const cookie = async (value) => {
    await call("Network.enable");
    await call("Network.clearBrowserCookies");
    await call("Network.setCookies", {
      cookies: value.split("; ").map((p) => {
        const i = p.indexOf("=");
        return {
          name: p.slice(0, i),
          value: p.slice(i + 1),
          url: origin,
          httpOnly: true,
          sameSite: "Lax",
        };
      }),
    });
  };
  let path = origin + base + "?versionId=" + versionId;
  const navigate = async () => {
    await call("Page.navigate", { url: path });
    await wait(
      '!!document.querySelector(".review-image-surface img") && document.querySelector(".review-image-surface img").complete && document.querySelector(".review-image-surface img").naturalWidth>0',
    );
    await new Promise((r) => setTimeout(r, 300));
  };

  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cookie(clientCookie);
  await navigate();
  const previewResponse = await fetch(
    origin + base + "/file?versionId=" + versionId + "&preview=1",
    { headers: { Cookie: clientCookie }, signal: AbortSignal.timeout(60000) },
  );
  const previewInfo = await sharp(
    Buffer.from(await previewResponse.arrayBuffer()),
  ).metadata();
  if (
    previewResponse.status !== 200 ||
    previewInfo.width > 2048 ||
    previewInfo.height > 2048 ||
    previewInfo.format !== "webp" ||
    !previewResponse.headers.get("cache-control")?.includes("no-store")
  )
    throw new Error("Private preview bounds/cache check failed");
  const unauthorized = await fetch(
    origin + base + "/file?versionId=" + versionId + "&preview=1",
    { redirect: "manual" },
  );
  if (unauthorized.status !== 401)
    throw new Error("Anonymous preview accepted");
  console.log(
    "Browser: large original served as a bounded private WebP; anonymous preview rejected.",
  );
  await button("Add comment");
  await text(".review-composer textarea", "Keep this pin on version one.");
  await evaluate(
    'document.querySelector(".review-image-surface img").dispatchEvent(new Event("error"));true',
  );
  await button("Retry image");
  await wait(
    '!document.querySelector(".review-canvas-footer button").disabled',
  );
  if (
    (await evaluate(
      'document.querySelector(".review-composer textarea").value',
    )) !== "Keep this pin on version one."
  )
    throw new Error("Image retry discarded draft");
  await button("Save comment");
  await wait('document.querySelectorAll("button.review-pin").length===1');
  await text(".decision-form textarea", "Approved for this image version.");
  await button("Save decision");
  await wait(
    'document.querySelector(".decision-reviewer")?.innerText.includes("Approved")',
  );
  const saved = (
    await db.query(
      'SELECT id,note FROM app."ReviewDecision" WHERE "versionId"=$1 AND "reviewerId"=$2',
      [versionId, client.id],
    )
  ).rows[0];
  const retry = {
    id: saved.id,
    expectedCurrentVersionId: versionId,
    decision: "APPROVED",
    note: saved.note,
  };
  const repeats = await Promise.all([
    decision(clientCookie, retry),
    decision(clientCookie, retry),
  ]);
  if (
    repeats.some((r) => r.status !== 200) ||
    (
      await db.query(
        'SELECT count(*)::int AS n FROM app."ReviewDecision" WHERE id=$1',
        [saved.id],
      )
    ).rows[0].n !== 1
  )
    throw new Error("Decision retry duplicated");
  if (
    (
      await decision(secondCookie, {
        id: randomUUID(),
        expectedCurrentVersionId: versionId,
        decision: "CHANGES_REQUESTED",
        note: "Please refine the headline.",
      })
    ).status !== 200
  )
    throw new Error("Second reviewer failed");
  await navigate();
  await wait('document.querySelectorAll(".decision-reviewer").length===2');
  console.log(
    "Browser: version-one pin and approval saved; retries stayed idempotent; two independent reviewer decisions displayed.",
  );
  await sharp({
    create: { width: 800, height: 1200, channels: 3, background: "#e8e4d9" },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="800" height="1200"><rect x="90" y="160" width="620" height="880" rx="45" fill="#6e7d58"/><circle cx="400" cy="600" r="160" fill="#f0ecd9"/></svg>',
        ),
      },
    ])
    .png()
    .toFile("/tmp/rr-step10-new.png");
  await cookie(designerCookie);
  await navigate();
  await evaluate('document.querySelector("button.review-pin").click();true');
  await wait('!!document.querySelector(".review-reply-form textarea")');
  await text(".review-reply-form textarea", "Updated in the next version.");
  await button("Send reply");
  await wait(
    'document.querySelector(".review-thread-list").innerText.includes("Updated in the next version.")',
  );
  await button("Resolve thread");
  await wait('!!document.querySelector("button.review-pin.is-resolved")');
  await evaluate('document.querySelector(".new-version-panel").open=true;true');
  const document = await call("DOM.getDocument"),
    fileNode = await call("DOM.querySelector", {
      nodeId: document.root.nodeId,
      selector: ".new-version-panel input[type=file]",
    });
  await call("DOM.setFileInputFiles", {
    nodeId: fileNode.nodeId,
    files: ["/tmp/rr-step10-new.png"],
  });
  await wait(
    'document.querySelector(".new-version-panel").innerText.includes("rr-step10-new.png")',
  );
  await button("Upload new version");
  await wait(
    'document.querySelector(".project-state")?.innerText.includes("Version 2")',
  );
  await wait(
    'document.querySelector(".review-image-surface img")?.naturalHeight===1200',
  );
  const current = (
    await db.query(
      'SELECT v.* FROM app."Asset" a JOIN app."AssetVersion" v ON v.id=a."currentVersionId" WHERE a.id=$1',
      [assetId],
    )
  ).rows[0];
  if (current.versionNumber !== 2 || current.objectKey === objectKey)
    throw new Error("Version was not immutable");
  objects.add(current.objectKey);
  objects.add(current.stagingKey);
  if (
    await evaluate(
      'document.querySelectorAll("button.review-pin").length!==0 || document.querySelectorAll(".decision-reviewer").length!==0 || !document.querySelector(".decision-heading").innerText.includes("Review required")',
    )
  )
    throw new Error("Old feedback/approval carried forward");
  const stale = await decision(clientCookie, {
    id: randomUUID(),
    expectedCurrentVersionId: versionId,
    decision: "APPROVED",
  });
  if (stale.status !== 409 || !stale.data.error.includes("Refresh"))
    throw new Error("Stale tab was not told to refresh");
  const oldWrite = await feedback(clientCookie, {
    operation: "create",
    input: {
      id: randomUUID(),
      body: "Old version write",
      xRatio: 0.5,
      yRatio: 0.5,
    },
  });
  if (oldWrite.status !== 409) throw new Error("Historical write was accepted");
  console.log(
    "Browser: native designer version upload published a new private portrait image; new version is unreviewed with no old pins; stale approval and historical feedback rejected 409.",
  );
  await cookie(clientCookie);
  path = origin + base + "?versionId=" + versionId;
  await navigate();
  await wait(
    'document.querySelectorAll("button.review-pin").length===1 && document.querySelectorAll(".decision-reviewer").length===2',
  );
  if (
    !(await evaluate(
      'document.querySelector(".review-canvas-footer button").disabled',
    ))
  )
    throw new Error("Historical feedback editor enabled");
  path = origin + base + "?versionId=" + current.id;
  await navigate();
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await button("Add comment");
  await wait(
    'document.querySelector(".review-sidebar").classList.contains("is-open")',
  );
  await text(".review-composer textarea", "Mobile feedback on the portrait.");
  await button("Save comment");
  await wait('document.querySelectorAll("button.review-pin").length===1');
  await evaluate('document.querySelector(".review-drawer-close").click();true');
  await evaluate(
    'document.querySelector("button.review-pin").focus();document.querySelector("button.review-pin").click();true',
  );
  await wait(
    'document.querySelector(".review-sidebar").contains(document.activeElement)',
  );
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
  });
  await call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
  });
  await wait(
    '!document.querySelector(".review-sidebar").classList.contains("is-open")',
  );
  if (
    (await evaluate(
      'document.activeElement.classList.contains("review-pin")',
    )) !== true
  )
    throw new Error("Drawer did not restore keyboard focus");
  await evaluate(
    '[...document.querySelectorAll(".decision-form label")].find(l=>l.textContent.trim()==="Request changes").querySelector("input").click();true',
  );
  await text(".decision-form textarea", "Please refine the portrait spacing.");
  await button("Save decision");
  await wait(
    'document.querySelector(".decision-reviewer")?.innerText.includes("Changes requested")',
  );
  await evaluate(
    '[...document.querySelectorAll(".decision-form label")].find(l=>l.textContent.trim()==="Approve this version").querySelector("input").click();true',
  );
  await text(".decision-form textarea", "Portrait layout approved.");
  await button("Save decision");
  await wait(
    'document.querySelector(".decision-reviewer")?.innerText.includes("Approved")',
  );
  await evaluate(
    `document.querySelector('#compare-version').value='${versionId}';document.querySelector('#compare-version').dispatchEvent(new Event('change',{bubbles:true}));true`,
  );
  await button("Compare versions");
  await wait(
    'document.querySelectorAll(".comparison-pane img").length===2 && [...document.querySelectorAll(".comparison-pane img")].every(i=>i.complete&&i.naturalWidth>0)',
  );
  const aspects = await evaluate(
    'Array.from(document.querySelectorAll(".comparison-pane img"),i=>{const r=i.getBoundingClientRect();return {natural:i.naturalWidth/i.naturalHeight,display:r.width/r.height};})',
  );
  if (aspects.some((a) => Math.abs(a.natural - a.display) > 0.01))
    throw new Error("Comparison distorted aspect ratios");
  await evaluate(
    'document.querySelector(".comparison-pane button").click();true',
  );
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await new Promise((r) => setTimeout(r, 100));
  let shot = await call("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  await writeFile(
    "/tmp/rr-step10-desktop.png",
    Buffer.from(shot.data, "base64"),
  );
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await new Promise((r) => setTimeout(r, 300));
  if (await evaluate("document.documentElement.scrollWidth>innerWidth"))
    throw new Error("Mobile comparison overflow");
  shot = await call("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  await writeFile(
    "/tmp/rr-step10-mobile.png",
    Buffer.from(shot.data, "base64"),
  );
  for (const width of [360, 390, 768, 1440]) {
    await call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 700,
    });
    await new Promise((r) => setTimeout(r, 100));
    if (await evaluate("document.documentElement.scrollWidth>innerWidth"))
      throw new Error("Overflow at " + width + "px");
  }
  console.log(
    "Browser: client mobile pin/drawer, Escape/focus restoration, changes request then approval and four responsive widths passed.",
  );
  console.log(
    "Browser: historical feedback remained readable and disabled; current client decision saved; side-by-side landscape/portrait comparison preserves each aspect ratio and Fit; 390px mobile has no overflow.",
  );
  await evaluate(
    '(async()=>{const r=await fetch("/auth/logout",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});if(!r.ok)throw new Error("Logout failed");return true;})()',
  );
  await call("Page.navigate", { url: origin + "/app" });
  await wait(
    'location.pathname==="/login"&&!!document.querySelector("input[name=email]")',
  );
  for (const [name, value] of [
    ["email", client.email],
    ["password", client.password],
  ]) {
    await evaluate(
      `(()=>{const e=document.querySelector('input[name=${name}]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`,
    );
  }
  await button("Log in");
  await wait('location.pathname.startsWith("/app")');
  console.log(
    "Browser: logout blocked the private route; the email/password login form restored authenticated access.",
  );
} catch (error) {
  console.error("Acceptance failure:", error.message);
  throw error;
} finally {
  ws?.close();
  chrome?.kill();
  for (const row of (
    await db.query(
      'SELECT "objectKey","stagingKey" FROM app."AssetVersion" WHERE "assetId"=$1',
      [assetId],
    )
  ).rows) {
    objects.add(row.objectKey);
    objects.add(row.stagingKey);
  }
  if (objects.size) {
    const r = await storage(`object/${bucket}`, "DELETE", {
      prefixes: [...objects],
    });
    if (!r.ok) throw new Error("Storage fixture cleanup failed");
  }
  await db.query(
    'DELETE FROM app."Workspace" WHERE id=$1 OR "createdById"=ANY($2::uuid[])',
    [workspaceId, users.map((u) => u.id)],
  );
  for (const u of users) {
    await db.query('DELETE FROM app."UserProfile" WHERE id=$1', [u.id]);
    const r = await admin("users/" + u.id, "DELETE");
    if (!r.ok) throw new Error("Auth cleanup failed");
  }
  await db.end();
  console.log(
    "Temporary version objects, decisions, comments, workspaces and Auth users removed.",
  );
}
