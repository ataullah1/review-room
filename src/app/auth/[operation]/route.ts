import { NextResponse, type NextRequest } from "next/server";
import { authenticate, type AuthOperation } from "@/lib/auth/core";
import { AuthFlowError } from "@/lib/auth/errors";
import { createAuthClient, authConfiguration } from "@/lib/auth/supabase";
import { identityFromUser } from "@/lib/auth/user";
import { requireSameOrigin } from "@/lib/auth/validation";
import { signupNetworkHash } from "@/lib/auth/ip";
import { reserveSignup, discardSignupPermit } from "@/lib/auth/rate-limit";
import { bootstrapWithQuota } from "@/lib/data/onboarding";
import { getDb } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };
async function readBody(request: NextRequest) {
  const reader = request.body?.getReader();
  if (!reader) return {};
  let content = "";
  let bytes = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 8192) {
      await reader.cancel();
      throw new AuthFlowError("Request is too large.", 413);
    }
    content += decoder.decode(value, { stream: true });
  }
  try {
    return JSON.parse(content + decoder.decode()) as unknown;
  } catch {
    throw new AuthFlowError("Invalid request.");
  }
}
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ operation: string }> },
) {
  if (!requireSameOrigin(request.headers))
    return NextResponse.json(
      { error: "Request origin is not allowed." },
      { status: 403, headers: privateHeaders },
    );
  const { operation } = await context.params;
  if (!["signup", "login", "logout", "bootstrap"].includes(operation))
    return NextResponse.json(
      { error: "Not found." },
      { status: 404, headers: privateHeaders },
    );
  try {
    const input = await readBody(request);
    const client = await createAuthClient(true);
    const result = await authenticate(operation as AuthOperation, input, {
      provider: {
        async signUp({ email, password, displayName, permit }) {
          const { data, error } = await client.auth.signUp({
            email,
            password,
            options: {
              data: { display_name: displayName, signup_permit: permit },
            },
          });
          return {
            error: !!error,
            rateLimited: error?.status === 429,
            hasSession: !!data.session,
          };
        },
        async signIn({ email, password }) {
          const { data, error } = await client.auth.signInWithPassword({
            email,
            password,
          });
          return {
            error: !!error,
            rateLimited: error?.status === 429,
            hasSession: !!data.session,
          };
        },
        async getUser() {
          const { data, error } = await client.auth.getUser();
          return !error && data.user ? identityFromUser(data.user) : null;
        },
        async signOut() {
          const { error } = await client.auth.signOut({ scope: "local" });
          return !error;
        },
      },
      reserveSignup: (email) =>
        reserveSignup(getDb(), signupNetworkHash(request.headers), email),
      discardPermit: (permit) => discardSignupPermit(getDb(), permit),
      async assertInstantSignup() {
        const { url, key } = authConfiguration();
        const response = await fetch(new URL("/auth/v1/settings", url), {
          headers: { apikey: key },
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        const settings = response.ok ? await response.json() : {};
        if (
          settings.mailer_autoconfirm !== true ||
          settings.external?.email !== true
        )
          throw new AuthFlowError(
            "Signup is temporarily unavailable. Please try again later.",
            503,
          );
      },
      bootstrap: (user, reserved) =>
        bootstrapWithQuota(getDb(), user, request.headers, reserved),
    });
    return NextResponse.json(result, { headers: privateHeaders });
  } catch (error) {
    const known = error instanceof AuthFlowError;
    return NextResponse.json(
      {
        error: known
          ? error.message
          : "Unable to complete this request. Please try again.",
      },
      {
        status: known ? error.status : 503,
        headers: {
          ...privateHeaders,
          ...(known && error.retryAfter
            ? { "Retry-After": String(error.retryAfter) }
            : {}),
        },
      },
    );
  }
}
