import { open } from "node:fs/promises";
import { createHash } from "node:crypto";
import { crc32 } from "node:zlib";
export const packageMaxFiles = 20;
export const packageMaxBytes = 100 * 1024 * 1024;
export function packageEntryName(index: number, original: string) {
  const safe =
    original
      .normalize("NFKC")
      .replace(/[\x00-\x1f\x7f/\\:]/g, "_")
      .replace(/^\.+/, "")
      .slice(0, 120)
      .trim() || "design";
  return `${String(index + 1).padStart(2, "0")}-${safe}`;
}
// Stored ZIP32, deterministic UTF-8 names, no symlinks, archive paths or compression
// bombs. Only one original (<=10 MiB) is held at a time; output stays on local disk.
export async function writeDeliveryZip(
  path: string,
  files: AsyncIterable<{ name: string; bytes: Buffer }>,
) {
  const file = await open(path, "wx", 0o600),
    hash = createHash("sha256");
  const central: Buffer[] = [],
    names = new Set<string>();
  let offset = 0,
    inputBytes = 0;
  async function write(bytes: Buffer) {
    await file.writeFile(bytes);
    hash.update(bytes);
    offset += bytes.length;
  }
  try {
    for await (const item of files) {
      if (
        names.size >= packageMaxFiles ||
        inputBytes + item.bytes.length > packageMaxBytes
      )
        throw new Error("Package limit exceeded.");
      if (
        !item.name ||
        /[\x00-\x1f\x7f/\\:]/.test(item.name) ||
        item.name.startsWith(".") ||
        names.has(item.name)
      )
        throw new Error("Unsafe package entry.");
      const name = Buffer.from(item.name),
        checksum = crc32(item.bytes),
        size = item.bytes.length;
      if (name.length > 512) throw new Error("Package name too long.");
      const local = Buffer.alloc(30),
        directory = Buffer.alloc(46);
      local.writeUInt32LE(0x04034b50);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(0x800, 6);
      local.writeUInt16LE(33, 12);
      local.writeUInt32LE(checksum, 14);
      local.writeUInt32LE(size, 18);
      local.writeUInt32LE(size, 22);
      local.writeUInt16LE(name.length, 26);
      directory.writeUInt32LE(0x02014b50);
      directory.writeUInt16LE(20, 4);
      directory.writeUInt16LE(20, 6);
      directory.writeUInt16LE(0x800, 8);
      directory.writeUInt16LE(33, 14);
      directory.writeUInt32LE(checksum, 16);
      directory.writeUInt32LE(size, 20);
      directory.writeUInt32LE(size, 24);
      directory.writeUInt16LE(name.length, 28);
      directory.writeUInt32LE(offset, 42);
      central.push(directory, name);
      names.add(item.name);
      inputBytes += size;
      await write(local);
      await write(name);
      await write(item.bytes);
    }
    if (!names.size) throw new Error("Empty package.");
    const start = offset;
    for (const bytes of central) await write(bytes);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50);
    end.writeUInt16LE(names.size, 8);
    end.writeUInt16LE(names.size, 10);
    end.writeUInt32LE(offset - start, 12);
    end.writeUInt32LE(start, 16);
    await write(end);
    return { bytes: offset, hash: hash.digest("hex") };
  } finally {
    await file.close();
  }
}
