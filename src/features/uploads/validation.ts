import { z } from "zod";
export const maxImageBytes = 10 * 1024 * 1024;
export const maxImagePixels = 20_000_000;
export const maxImageSide = 8192;
export const imageTypes = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
} as const;
export const uploadInput = z
  .object({
    assetId: z.uuid().optional(),
    name: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .refine(
        (name) =>
          !name.includes("/") &&
          !name.includes("\\") &&
          !Array.from(name).some(
            (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
          ),
        "Use a valid file name.",
      ),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    size: z
      .number()
      .int()
      .min(1)
      .max(maxImageBytes, "Choose an image of 10 MB or less."),
  })
  .refine(
    (file) =>
      (imageTypes[file.mimeType] as readonly string[]).includes(
        file.name.split(".").pop()?.toLowerCase() || "",
      ),
    "The file extension must match JPG, PNG or WebP.",
  );
export class UploadError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
