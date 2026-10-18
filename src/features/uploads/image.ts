import sharp from "sharp";
import { createHash } from "node:crypto";
import {
  uploadInput,
  UploadError,
  maxImageBytes,
  maxImagePixels,
  maxImageSide,
} from "./validation";
function animatedContainer(bytes: Buffer, format: string) {
  if (format === "png") {
    for (let pos = 8; pos + 12 <= bytes.length;) {
      const size = bytes.readUInt32BE(pos);
      const type = bytes.toString("ascii", pos + 4, pos + 8);
      if (type === "acTL" || type === "fcTL" || type === "fdAT") return true;
      if (size > bytes.length - pos - 12) break;
      pos += size + 12;
    }
  }
  if (format === "webp") {
    for (let pos = 12; pos + 8 <= bytes.length;) {
      const type = bytes.toString("ascii", pos, pos + 4),
        size = bytes.readUInt32LE(pos + 4);
      if (
        type === "ANIM" ||
        type === "ANMF" ||
        (type === "VP8X" && size >= 1 && bytes[pos + 8] & 2)
      )
        return true;
      if (size > bytes.length - pos - 8) break;
      pos += 8 + size + (size % 2);
    }
  }
  return false;
}
export async function validateImage(
  bytes: Buffer,
  declared: { name: string; mimeType: string; size: number },
) {
  const input = uploadInput.safeParse(declared);
  if (!input.success)
    throw new UploadError("Choose a JPG, PNG or static WebP of 10 MB or less.");
  if (
    !bytes.length ||
    bytes.length > maxImageBytes ||
    bytes.length !== input.data.size
  )
    throw new UploadError(
      "The uploaded file size does not match. Please upload it again.",
    );
  const detected = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? "image/png"
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      ? "image/jpeg"
      : bytes.toString("ascii", 0, 4) === "RIFF" &&
          bytes.toString("ascii", 8, 12) === "WEBP"
        ? "image/webp"
        : null;
  if (!detected || detected !== input.data.mimeType)
    throw new UploadError(
      "The actual image format does not match its file extension and type.",
    );
  try {
    const image = sharp(bytes, {
      limitInputPixels: maxImagePixels,
      failOn: "warning",
      sequentialRead: true,
    });
    const info = await image.metadata();
    const mimeType =
      info.format === "jpeg"
        ? "image/jpeg"
        : info.format === "png"
          ? "image/png"
          : info.format === "webp"
            ? "image/webp"
            : null;
    if (!mimeType || mimeType !== input.data.mimeType)
      throw new UploadError(
        "The actual image format does not match its file extension and type.",
      );
    if ((info.pages || 1) > 1 || animatedContainer(bytes, info.format!))
      throw new UploadError(
        "Animated images are not supported. Choose a static image.",
      );
    const { width, height } = info.autoOrient;
    if (
      !width ||
      !height ||
      width > maxImageSide ||
      height > maxImageSide ||
      width * height > maxImagePixels
    )
      throw new UploadError(
        "Images must be within 8192 px per side and 20 megapixels.",
      );
    // metadata alone does not decode compressed image pixels. stats forces a full
    // decode without retaining an 80 MB raw pixel buffer in application memory.
    await image.stats();
    return {
      width,
      height,
      mimeType,
      fileSize: bytes.length,
      contentHash: createHash("sha256").update(bytes).digest("hex"),
    };
  } catch (error) {
    if (error instanceof UploadError) throw error;
    throw new UploadError(
      "This image is corrupt or exceeds the 20-megapixel limit.",
    );
  }
}
