import { ZodError } from "zod";
import { AccessError } from "../../lib/auth/errors";
import { UploadError } from "./validation";
import {
  mutationFailure,
  type MutationFailureContext,
} from "../../lib/server/diagnostics";

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
export function uploadFailure(
  error: unknown,
  context?: Partial<MutationFailureContext>,
  log?: (line: string) => void,
) {
  if (error instanceof AccessError || error instanceof UploadError)
    return { error: error.message, status: error.status };
  if (error instanceof ZodError)
    return {
      error: "Choose a JPG, PNG or static WebP of 10 MB or less.",
      status: 400,
    };
  const failure = mutationFailure(
    error,
    {
      domain: "uploads",
      operation: context?.operation || "upload",
      stage: context?.stage || "storage",
      fallback:
        context?.fallback ||
        "Could not complete this upload. Please try again.",
    },
    log,
  );
  return {
    error: failure.body.error,
    status: failure.status,
    requestId: failure.body.requestId,
  };
}
