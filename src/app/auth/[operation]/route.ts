import { NextResponse, type NextRequest } from "next/server";
import { authenticate, type AuthOperation } from "@/lib/auth/core";
import { AuthFlowError } from "@/lib/auth/errors";
import { createAuthClient, authConfiguration } from "@/lib/auth/supabase";
import { identityFromUser } from "@/lib/auth/user";
import { requireSameOrigin, safeReturnPath } from "@/lib/auth/validation";
import { signupNetworkHash } from "@/lib/auth/ip";
import { reserveSignup, discardSignupPermit } from "@/lib/auth/rate-limit";
import { bootstrapWithQuota } from "@/lib/data/onboarding";
import { getDb } from "@/lib/server/db";
import { authFailure, type AuthStage } from "@/lib/auth/failure";
import { readAppOrigin } from "@/lib/config/deployment";

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
  if (
    ![
      "signup",
      "login",
      "logout",
      "bootstrap",
      "resend",
      "recover",
      "reset-password",
    ].includes(operation)
  )
    return NextResponse.json(
      { error: "Not found." },
      { status: 404, headers: privateHeaders },
    );
  let stage: AuthStage = "request_body";
  try {
    const input = await readBody(request);
    stage = "configuration";
    const client = await createAuthClient(true);
    const result = await authenticate(operation as AuthOperation, input, {
      provider: {
        async signUp({ email, password, displayName, permit }) {
          stage = "signup_provider";
          const appOrigin = readAppOrigin();
          const nextParam =
            input &&
            typeof input === "object" &&
            "next" in input &&
            typeof input.next === "string"
              ? safeReturnPath(input.next)
              : "";
          const emailRedirectTo = nextParam
            ? `${appOrigin}/auth/callback?next=${encodeURIComponent(nextParam)}`
            : `${appOrigin}/auth/callback`;
          const { data, error } = await client.auth.signUp({
            email,
            password,
            options: {
              data: { display_name: displayName, signup_permit: permit },
              emailRedirectTo,
            },
          });
          return {
            error: !!error,
            rateLimited: error?.status === 429,
            hasSession: !!data.session,
          };
        },
        async signIn({ email, password }) {
          stage = "password_provider";
          const { data, error } = await client.auth.signInWithPassword({
            email,
            password,
          });
          const unconfirmed =
            error?.message?.toLowerCase().includes("email not confirmed") ??
            false;
          return {
            error: !!error,
            rateLimited: error?.status === 429,
            hasSession: !!data.session,
            unconfirmed,
          };
        },
        async resendVerification({ email }) {
          stage = "resend_provider";
          const appOrigin = readAppOrigin();
          const { error } = await client.auth.resend({
            type: "signup",
            email,
            options: {
              emailRedirectTo: `${appOrigin}/auth/callback`,
            },
          });
          return {
            error: !!error,
            rateLimited: error?.status === 429,
          };
        },
        async resetPasswordForEmail({ email }) {
          stage = "password_provider";
          const appOrigin = readAppOrigin();
          const { error } = await client.auth.resetPasswordForEmail(email, {
            redirectTo: `${appOrigin}/auth/callback?type=recovery`,
          });
          return {
            error: !!error,
            rateLimited: error?.status === 429,
          };
        },
        async updatePassword({ password }) {
          stage = "password_provider";
          const { error } = await client.auth.updateUser({ password });
          return {
            error: !!error,
            rateLimited: error?.status === 429,
          };
        },
        async getUser() {
          stage = "identity_provider";
          const { data, error } = await client.auth.getUser();
          return !error && data.user ? identityFromUser(data.user) : null;
        },
        async signOut() {
          stage = "logout_provider";
          const { error } = await client.auth.signOut({ scope: "local" });
          return !error;
        },
      },
      reserveSignup: (email) => {
        stage = "quota_database";
        return reserveSignup(
          getDb(),
          signupNetworkHash(request.headers),
          email,
        );
      },
      async discardPermit(permit) {
        try {
          await discardSignupPermit(getDb(), permit);
        } catch (error) {
          stage = "permit_cleanup";
          throw error;
        }
      },
      async assertInstantSignup() {
        stage = "provider_settings";
        const { url, key } = authConfiguration();
        const response = await fetch(new URL("/auth/v1/settings", url), {
          headers: { apikey: key },
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        const settings = response.ok ? await response.json() : {};
        if (settings.external?.email !== true)
          throw new AuthFlowError(
            "Signup is temporarily unavailable. Please try again later.",
            503,
          );
      },
      bootstrap: (user, reserved) => {
        stage = "workspace_database";
        return bootstrapWithQuota(getDb(), user, request.headers, reserved);
      },
    });
    return NextResponse.json(result, { headers: privateHeaders });
  } catch (error) {
    const failure = authFailure(error, {
      operation: operation as AuthOperation,
      stage,
      fallback: "Unable to complete this request. Please try again.",
    });
    return NextResponse.json(failure.body, {
      status: failure.status,
      headers: {
        ...privateHeaders,
        ...(failure.retryAfter
          ? { "Retry-After": String(failure.retryAfter) }
          : {}),
      },
    });
  }
}
