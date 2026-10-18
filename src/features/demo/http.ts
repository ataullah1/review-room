import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AccessError } from "../../lib/auth/errors";
export const demoHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};
export function demoFailure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof AccessError
          ? error.message
          : error instanceof ZodError
            ? "Use the supported demo controls and sample designs."
            : "Could not load or save your demo. Please try again.",
    },
    {
      status:
        error instanceof AccessError
          ? error.status
          : error instanceof ZodError
            ? 400
            : 503,
      headers: demoHeaders,
    },
  );
}
export async function demoJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new AccessError("Invalid demo request.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) throw new AccessError("Demo request is too large.", 413);
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AccessError("Invalid demo request.", 400);
  }
}
