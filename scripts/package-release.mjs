// Package the CURRENT source tree, including uncommitted work, without Git history,
// generated files or private config. Python stdlib ZIP handles >20 source files.
import {
  readFile,
  readdir,
  mkdir,
  writeFile,
  lstat,
  realpath,
} from "node:fs/promises";
import { resolve, join, relative, extname } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { parse } from "dotenv";
const root = await realpath(process.cwd()),
  pkg = JSON.parse(await readFile("package.json", "utf8"));
const output = resolve(`.local/vibe96/review-room-${pkg.version}`);
await mkdir(output, { recursive: true, mode: 0o700 });
const roots = [
  "src",
  "public",
  "prisma",
  "supabase",
  "scripts",
  "tests",
  "docs",
  ".github",
];
const files = [
  ".env.example",
  ".gitignore",
  ".prettierignore",
  ".prettierrc.json",
  "AGENTS.md",
  "README.md",
  "HowToSetup.md",
  "DEMO_SETUP.md",
  "CHANGELOG.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "next.config.mjs",
  "prisma.config.ts",
  "postcss.config.mjs",
  "eslint.config.mjs",
  "components.json",
  "vercel.json",
];
const skipped = new Set([
  "node_modules",
  ".next",
  ".git",
  ".local",
  ".codex",
  ".agents",
  ".aws",
  ".vercel",
  "coverage",
  "generated",
]);
async function collect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (skipped.has(entry.name)) continue;
    const path = join(dir, entry.name),
      stat = await lstat(path);
    if (stat.isSymbolicLink())
      throw new Error(`Refusing package symlink: ${path}`);
    if (stat.isDirectory()) await collect(path);
    else if (
      stat.isFile() &&
      !entry.name.startsWith(".env") &&
      !/\.(?:log|pem|key|crt|pgdump|enc|tsbuildinfo)$/i.test(entry.name)
    )
      files.push(path);
  }
}
for (const dir of roots) await collect(dir);
// Compare actual local secrets without logging their values or modifying .env.
const secretNames =
  /^(?:SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|DIRECT_URL|SIGNUP_RATE_LIMIT_SECRET|CRON_SECRET|MAIL_API_KEY|RESEND_API_KEY|MAIL_PAYLOAD_SECRET|VERCEL_TOKEN|SUPABASE_ACCESS_TOKEN)$/;
const secrets = new Set();
for (const name of (await readdir(root)).filter(
  (name) => /^\.env(?:\.|$)/.test(name) && name !== ".env.example",
)) {
  if (!(await lstat(name)).isFile()) continue;
  for (const [key, value] of Object.entries(parse(await readFile(name))))
    if (secretNames.test(key) && value.length >= 16) {
      secrets.add(value);
      if (key.endsWith("DATABASE_URL") || key === "DIRECT_URL") {
        try {
          const password = decodeURIComponent(new URL(value).password);
          if (password.length >= 8) secrets.add(password);
        } catch {
          /* Invalid local URLs are not printed. */
        }
      }
    }
}
const manifest = [],
  unique = [...new Set(files)].sort();
for (const path of unique) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error("Package input is not a regular source file.");
  const absolute = await realpath(path);
  if (!absolute.startsWith(root + "/"))
    throw new Error("Package path escaped repository.");
  const bytes = await readFile(path);
  const text = bytes.toString("utf8");
  if (
    /\.(?:[cm]?[jt]sx?|json|ya?ml|md|sql|txt)$/.test(path) ||
    !extname(path) ||
    path === ".env.example"
  ) {
    if (
      [...secrets].some((secret) => text.includes(secret)) ||
      /sb_secret_[A-Za-z0-9_-]{16,}/.test(text) ||
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)
    )
      throw new Error(`Private credential detected; archive refused: ${path}`);
  }
  manifest.push({
    path: relative(root, absolute),
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
const filename = `review-room-${pkg.version}-source.zip`,
  archive = join(output, filename);
const build = spawnSync(
  "python3",
  [
    "-c",
    `import json,sys,zipfile,pathlib
root=pathlib.Path(sys.argv[1]); files=json.load(sys.stdin); target=pathlib.Path(sys.argv[2]); temporary=target.with_suffix('.tmp')
with zipfile.ZipFile(temporary,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for row in files:
  name=row['path']; assert not name.startswith('/') and '..' not in pathlib.PurePosixPath(name).parts
  z.write(root/name, 'review-room/'+name)
with zipfile.ZipFile(temporary) as z:
 assert z.testzip() is None
 assert len(z.namelist())==len(files)
temporary.replace(target)
`,
    root,
    archive,
  ],
  { input: JSON.stringify(manifest), encoding: "utf8" },
);
if (build.status !== 0)
  throw new Error(
    "Source archive failed. Python 3 is required; no private configuration was included.",
  );
const bytes = await readFile(archive);
await writeFile(
  join(output, "source-manifest.json"),
  JSON.stringify(
    {
      version: pkg.version,
      createdAt: new Date().toISOString(),
      archive: filename,
      archiveSha256: createHash("sha256").update(bytes).digest("hex"),
      includesUncommittedSource: true,
      secretScan:
        "Known local secret values + server-key/private-key signatures; not a full Git-history audit",
      files: manifest,
    },
    null,
    2,
  ) + "\n",
  { mode: 0o600 },
);
console.log(
  `Prepared ${filename}: ${manifest.length} files, ${(bytes.length / 1024 / 1024).toFixed(2)} MiB. ZIP integrity and secret exclusion checks passed. Output: .local/vibe96/review-room-${pkg.version}/`,
);
