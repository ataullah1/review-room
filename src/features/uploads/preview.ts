import sharp from "sharp";
import { maxImageBytes, maxImagePixels, UploadError } from "./validation";

// Called only after the file route has authorized the immutable READY version.
// Keep the same geometry as the original so normalized pins do not move.
export async function imagePreview(bytes: Buffer) {
  if (!bytes.length || bytes.length > maxImageBytes)
    throw new UploadError("The image preview is unavailable.", 503);
  try {
    let preview = await sharp(bytes, {
      limitInputPixels: maxImagePixels,
      failOn: "warning",
      sequentialRead: true,
    })
      .autoOrient()
      .resize({
        width: 2048,
        height: 2048,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();
    // Leave room beneath the host's response-size ceiling, including noisy
    // transparent images whose alpha channel can dominate the WebP payload.
    if (preview.length > 3 * 1024 * 1024)
      preview = await sharp(preview)
        .resize({ width: 1024, height: 1024, fit: "inside" })
        .webp({ quality: 75, alphaQuality: 80 })
        .toBuffer();
    if (preview.length > 3 * 1024 * 1024)
      throw new UploadError("The image preview is too large.", 503);
    return preview;
  } catch {
    throw new UploadError(
      "The image preview is unavailable. Please retry.",
      503,
    );
  }
}
export const previewHeaders = {
  "Content-Type": "image/webp",
  "X-Content-Type-Options": "nosniff",
};
