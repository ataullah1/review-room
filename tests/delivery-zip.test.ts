import { it, expect } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  packageEntryName,
  writeDeliveryZip,
} from "../src/features/delivery/zip";
it("creates an independently readable ZIP with exact bytes, deterministic checksum and safe unique names", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rr-zip-test-")),
    path = join(directory, "fixture.zip");
  const names = [
    packageEntryName(0, "../../design.png"),
    packageEntryName(1, "../../design.png"),
  ];
  try {
    async function* files() {
      for (const name of names)
        yield { name, bytes: Buffer.from("synthetic original") };
    }
    const result = await writeDeliveryZip(path, files());
    const bytes = await readFile(path);
    expect(result.hash).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(result.bytes).toBe(bytes.length);
    // Python's standard-library ZIP reader independently validates CRC and directory offsets.
    const check = spawnSync("python3", [
      "-c",
      "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert len(z.namelist())==2; assert all(z.read(n)==b'synthetic original' for n in z.namelist()); assert all('/' not in n and '\\\\' not in n for n in z.namelist())",
      path,
    ]);
    expect(check.status).toBe(0);
    expect(new Set(names).size).toBe(2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
it("rejects traversal, duplicate entries and more than 20 files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rr-zip-test-"));
  try {
    async function* bad() {
      yield { name: "../secret", bytes: Buffer.alloc(1) };
    }
    await expect(
      writeDeliveryZip(join(directory, "bad.zip"), bad()),
    ).rejects.toThrow("Unsafe");
    async function* duplicate() {
      yield { name: "design.png", bytes: Buffer.alloc(1) };
      yield { name: "design.png", bytes: Buffer.alloc(1) };
    }
    await expect(
      writeDeliveryZip(join(directory, "duplicate.zip"), duplicate()),
    ).rejects.toThrow("Unsafe");
    async function* many() {
      for (let i = 0; i < 21; i++)
        yield { name: `${i}.png`, bytes: Buffer.alloc(1) };
    }
    await expect(
      writeDeliveryZip(join(directory, "many.zip"), many()),
    ).rejects.toThrow("limit");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
