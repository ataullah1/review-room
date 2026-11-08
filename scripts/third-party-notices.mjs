// Installed production dependency/license inventory. Does not install or contact a registry.
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { readFile, readdir, writeFile, realpath } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
const root = resolve("package.json"),
  seen = new Map(),
  notices = new Map(),
  missing = [];
async function visit(name, parent, optional = false) {
  const require = createRequire(parent);
  const candidate = (require.resolve.paths(name) || [])
    .map((base) => join(base, name, "package.json"))
    .find(existsSync);
  if (!candidate) {
    if (!optional) missing.push(name);
    return;
  }
  const file = await realpath(candidate);
  const pkg = JSON.parse(await readFile(file, "utf8")),
    id = `${pkg.name}@${pkg.version}`;
  if (seen.has(id)) return;
  const dir = resolve(file, ".."),
    files = (await readdir(dir)).filter((name) =>
      /^(licen[cs]e|notice|copying)(\.|$)/i.test(name),
    );
  const licenses = [];
  for (const name of files) {
    try {
      const text = await readFile(join(dir, name), "utf8"),
        hash = createHash("sha256").update(text).digest("hex");
      if (!notices.has(hash)) notices.set(hash, { text, packages: [] });
      notices.get(hash).packages.push(id);
      licenses.push(hash);
    } catch {
      /* Only regular, readable license files. */
    }
  }
  seen.set(id, {
    license:
      typeof pkg.license === "string" ? pkg.license : "See upstream metadata",
    licenses,
  });
  for (const [dep] of Object.entries(pkg.dependencies || {}))
    await visit(dep, file);
  for (const [dep] of Object.entries(pkg.optionalDependencies || {}))
    await visit(dep, file, true);
}
const pkg = JSON.parse(await readFile(root, "utf8"));
for (const name of Object.keys(pkg.dependencies)) await visit(name, root);
if (missing.length)
  throw new Error(
    `Production dependency inventory incomplete: ${[...new Set(missing)].join(", ")}`,
  );
let output =
  "# Third-party notices\n\nGenerated from installed production dependencies. Original upstream license/notice texts are retained below; this inventory is not a legal compatibility certification. Platform-specific optional packages not installed on the capture machine are excluded; consult each installed distribution on the target platform. Development tools are restored separately from the lockfile.\n\nSelf-hosted font licenses remain in `public/fonts/`. Artwork source/redistribution notes remain in `public/demo/LICENSE.md` and `public/reviewer-demo/LICENSE.md`. The application license remains `LICENSE`.\n\n| Package | Reported license | Bundled notice |\n| --- | --- | --- |\n";
for (const [id, value] of [...seen].sort(([a], [b]) => a.localeCompare(b)))
  output += `| ${id} | ${value.license.replaceAll("|", "/")} | ${value.licenses.length ? "Retained below" : "Consult package distribution"} |\n`;
for (const { text, packages } of notices.values())
  output += `\n## ${[...new Set(packages)].sort().join(", ")}\n\n~~~~text\n${text.trim()}\n~~~~\n`;
await writeFile("THIRD_PARTY_NOTICES.md", output);
console.log(
  `Retained ${notices.size} distinct notice texts for ${seen.size} installed production packages.`,
);
