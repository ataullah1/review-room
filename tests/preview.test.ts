import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { imagePreview } from "../src/features/uploads/preview";
import { validateImage } from "../src/features/uploads/image";
import { maxImageBytes } from "../src/features/uploads/validation";

describe("private review previews", () => {
  it("bounds large originals, preserves pin geometry and strips metadata", async () => {
    const original = await sharp({
      create: { width: 4096, height: 2048, channels: 3, background: "#59734d" },
    })
      .withMetadata()
      .png()
      .toBuffer();
    const preview = await imagePreview(original),
      info = await sharp(preview).metadata();
    expect(info).toMatchObject({ format: "webp", width: 2048, height: 1024 });
    expect(info.exif).toBeUndefined();
    expect(preview.length).toBeLessThan(original.length);
    expect((await sharp(original).metadata()).width).toBe(4096);
  });
  it("does not enlarge small images and retains transparency", async () => {
    const original = await sharp({
      create: {
        width: 40,
        height: 80,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();
    expect(await sharp(await imagePreview(original)).metadata()).toMatchObject({
      width: 40,
      height: 80,
      hasAlpha: true,
    });
  });
  it("applies phone EXIF orientation before stripping metadata and records matching new-upload geometry", async () => {
    const bytes = await sharp({
      create: { width: 80, height: 40, channels: 3, background: "#59734d" },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const original = await sharp(bytes).metadata();
    expect(original).toMatchObject({ width: 80, height: 40, orientation: 6 });
    expect(
      await validateImage(bytes, {
        name: "phone.jpg",
        mimeType: "image/jpeg",
        size: bytes.length,
      }),
    ).toMatchObject({ width: 40, height: 80 });
    const preview = await sharp(await imagePreview(bytes)).metadata();
    expect(preview).toMatchObject({ width: 40, height: 80 });
    expect(preview.orientation).toBeUndefined();
    expect(preview.exif).toBeUndefined();
  });
  it("reduces noisy transparent previews to stay below the response-size ceiling", async () => {
    const bytes = await sharp(randomBytes(2048 * 2048 * 4), {
      raw: { width: 2048, height: 2048, channels: 4 },
    })
      .webp({ quality: 85 })
      .toBuffer();
    expect(bytes.length).toBeLessThanOrEqual(maxImageBytes);
    const preview = await imagePreview(bytes);
    expect(preview.length).toBeLessThanOrEqual(3 * 1024 * 1024);
    expect(await sharp(preview).metadata()).toMatchObject({
      width: 1024,
      height: 1024,
      hasAlpha: true,
    });
  }, 20000);
  it("rejects empty, corrupt and oversized source bytes", async () => {
    for (const bytes of [
      Buffer.alloc(0),
      Buffer.from("broken"),
      Buffer.alloc(maxImageBytes + 1),
    ])
      await expect(imagePreview(bytes)).rejects.toMatchObject({ status: 503 });
  });
});
