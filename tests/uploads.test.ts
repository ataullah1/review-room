import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { validateImage } from "../src/features/uploads/image";
import { uploadInput, maxImageBytes } from "../src/features/uploads/validation";
import { readUploadJson, uploadFailure } from "../src/features/uploads/http";
const image = () =>
  sharp({
    create: { width: 40, height: 25, channels: 3, background: "#59734d" },
  });
describe("authoritative image validation", () => {
  it.each([
    ["png", "image/png", "png"],
    ["jpeg", "image/jpeg", "jpg"],
    ["webp", "image/webp", "webp"],
  ] as const)(
    "fully decodes supported %s bytes",
    async (format, mimeType, ext) => {
      const bytes = await image().toFormat(format).toBuffer();
      expect(
        await validateImage(bytes, {
          name: `design.${ext}`,
          mimeType,
          size: bytes.length,
        }),
      ).toMatchObject({
        width: 40,
        height: 25,
        fileSize: bytes.length,
        mimeType,
      });
    },
  );
  it("rejects fake extension or MIME even when declared metadata passes", async () => {
    const bytes = await image().jpeg().toBuffer();
    await expect(
      validateImage(bytes, {
        name: "fake.png",
        mimeType: "image/png",
        size: bytes.length,
      }),
    ).rejects.toThrow(/actual image format/);
  });
  it("rejects SVG, HTML, arbitrary binary and empty content", async () => {
    for (const bytes of [
      Buffer.from('<svg width="10" height="10"></svg>'),
      Buffer.from("<html>not an image</html>"),
      Buffer.from([1, 2, 3]),
      Buffer.alloc(0),
    ])
      await expect(
        validateImage(bytes, {
          name: "fake.png",
          mimeType: "image/png",
          size: Math.max(1, bytes.length),
        }),
      ).rejects.toThrow();
  });
  it("rejects corrupt images that retain a valid PNG header", async () => {
    const valid = await image().png().toBuffer();
    const bytes = valid.subarray(0, valid.length - 30);
    await expect(
      validateImage(bytes, {
        name: "corrupt.png",
        mimeType: "image/png",
        size: bytes.length,
      }),
    ).rejects.toThrow();
  });
  it("rejects oversize actual bytes and declared-size mismatch", async () => {
    const bytes = await image().png().toBuffer();
    await expect(
      validateImage(bytes, {
        name: "size.png",
        mimeType: "image/png",
        size: bytes.length + 1,
      }),
    ).rejects.toThrow(/size/);
    await expect(
      validateImage(Buffer.alloc(maxImageBytes + 1), {
        name: "large.png",
        mimeType: "image/png",
        size: maxImageBytes,
      }),
    ).rejects.toThrow(/size/);
  });
  it("rejects overlong sides and image decompression above 20 MP", async () => {
    for (const [width, height] of [
      [8193, 1],
      [5000, 4001],
    ]) {
      const bytes = await sharp({
        create: { width, height, channels: 3, background: "white" },
      })
        .png()
        .toBuffer();
      await expect(
        validateImage(bytes, {
          name: "large.png",
          mimeType: "image/png",
          size: bytes.length,
        }),
      ).rejects.toThrow(/8192|megapixel/);
    }
  });
  it("rejects APNG animation chunks before pixel decoding", async () => {
    const bytes = await image().png().toBuffer();
    const animation = Buffer.alloc(20);
    animation.writeUInt32BE(8);
    animation.write("acTL", 4);
    animation.writeUInt32BE(2, 8);
    const combined = Buffer.concat([
      bytes.subarray(0, 33),
      animation,
      bytes.subarray(33),
    ]);
    await expect(
      validateImage(combined, {
        name: "animated.png",
        mimeType: "image/png",
        size: combined.length,
      }),
    ).rejects.toThrow(/Animated/);
  });
  it("rejects animated WebP containers", async () => {
    const frame = await image().png().toBuffer();
    const bytes = await sharp(
      [
        frame,
        await sharp({
          create: { width: 40, height: 25, channels: 3, background: "red" },
        })
          .png()
          .toBuffer(),
      ],
      { join: { animated: true } },
    )
      .webp({ loop: 0, delay: [100, 100] })
      .toBuffer();
    await expect(
      validateImage(bytes, {
        name: "animated.webp",
        mimeType: "image/webp",
        size: bytes.length,
      }),
    ).rejects.toThrow(/Animated/);
  });
  it("validates filenames and payload metadata without trusting them as bytes", () => {
    for (const name of ["../x.png", "x\\y.png", "bad\0.png", "image.svg"])
      expect(
        uploadInput.safeParse({ name, mimeType: "image/png", size: 123 })
          .success,
      ).toBe(false);
    expect(
      uploadInput.safeParse({
        name: "file.jpg",
        mimeType: "image/png",
        size: 123,
      }).success,
    ).toBe(false);
  });
});
describe("upload HTTP boundary", () => {
  it("accepts only small JSON metadata and rejects malformed bodies", async () => {
    expect(
      await readUploadJson(
        new Request("https://example.test", {
          method: "POST",
          body: '{"name":"design.png"}',
        }),
      ),
    ).toEqual({ name: "design.png" });
    await expect(
      readUploadJson(
        new Request("https://example.test", {
          method: "POST",
          body: "invalid",
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      readUploadJson(
        new Request("https://example.test", {
          method: "POST",
          body: "a".repeat(4097),
        }),
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("does not expose unknown provider/database error strings", () => {
    expect(uploadFailure(new Error("sensitive-provider-error"))).toEqual({
      status: 503,
      error: "Could not complete this upload. Please try again.",
    });
  });
});
