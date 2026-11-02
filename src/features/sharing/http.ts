import { NextResponse } from "next/server";
import { AccessError } from "../../lib/auth/errors";
import { ZodError } from "zod";
import {
  mutationFailure,
  type MutationFailureContext,
} from "../../lib/server/diagnostics";
export const capabilityHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};
export function capabilityFailure(
  error: unknown,
  context?: Partial<MutationFailureContext>,
  log?: (line: string) => void,
) {
  if (error instanceof AccessError) {
    return NextResponse.json(
      { error: error.message },
      {
        status: error.status,
        headers: {
          ...capabilityHeaders,
          ...(error.status === 429 ? { "Retry-After": "600" } : {}),
        },
      },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Check the link or invitation details." },
      { status: 400, headers: capabilityHeaders },
    );
  }
  const result = mutationFailure(
    error,
    {
      domain: "sharing",
      operation: context?.operation || "capability",
      stage: context?.stage || "sharing_store",
      fallback:
        context?.fallback ||
        "Could not complete this request. Please try again.",
    },
    log,
  );
  return NextResponse.json(result.body, {
    status: result.status,
    headers: {
      ...capabilityHeaders,
      ...(result.retryAfter
        ? { "Retry-After": String(result.retryAfter) }
        : {}),
    },
  });
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
