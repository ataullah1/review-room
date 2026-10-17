import { ZodError } from "zod";
import { AccessError } from "../../lib/auth/errors";
import { UploadError } from "./validation";
export const uploadHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
  "Referrer-Policy": "no-referrer",
};
export async function readUploadJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new UploadError("Invalid request.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096)
        throw new UploadError("Only upload metadata is accepted here.", 413);
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new UploadError("Invalid request.");
  }
}
export function uploadFailure(error: unknown) {
  if (error instanceof AccessError || error instanceof UploadError)
    return { error: error.message, status: error.status };
  if (error instanceof ZodError)
    return {
      error: "Choose a JPG, PNG or static WebP of 10 MB or less.",
      status: 400,
    };
  return {
    error: "Could not complete this upload. Please try again.",
    status: 503,
  };
}
