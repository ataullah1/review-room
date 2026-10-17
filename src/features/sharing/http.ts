import { NextResponse } from "next/server";
import { AccessError } from "../../lib/auth/errors";
import { ZodError } from "zod";
export const capabilityHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};
export function capabilityFailure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof AccessError
          ? error.message
          : error instanceof ZodError
            ? "Check the link or invitation details."
            : "Could not complete this request. Please try again.",
    },
    {
      status:
        error instanceof AccessError
          ? error.status
          : error instanceof ZodError
            ? 400
            : 503,
      headers: {
        ...capabilityHeaders,
        ...(error instanceof AccessError && error.status === 429
          ? { "Retry-After": "600" }
          : {}),
      },
    },
  );
}
export async function readCapabilityJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new AccessError("Invalid request.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) throw new AccessError("Request is too large.", 413);
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AccessError("Invalid request.", 400);
  }
}
