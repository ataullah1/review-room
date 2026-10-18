import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { authConfiguration, createAuthClient } from "@/lib/auth/supabase";
import { safeReturnPath, requireSameOrigin } from "@/lib/auth/validation";
import {
  beginGoogle,
  googleIntentCookie,
  googleIntentScope,
} from "@/lib/auth/google";
import { signupNetworkHash } from "@/lib/auth/ip";
import { reserveSignup, discardSignupPermit } from "@/lib/auth/rate-limit";
import { AuthFlowError } from "@/lib/auth/errors";
import { getDb } from "@/lib/server/db";
import { authFailure, type AuthStage } from "@/lib/auth/failure";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  if (!requireSameOrigin(request.headers))
    return NextResponse.json(
      { error: "Request origin is not allowed." },
      { status: 403, headers },
    );
  let stage: AuthStage = "configuration";
  try {
    const { url, key } = authConfiguration();
    const callback = new URL(
      "/auth/callback",
      process.env.NEXT_PUBLIC_APP_URL!,
    );
    const client = await createAuthClient(true);
    const result = await beginGoogle({
      supabaseUrl: url,
      async enabled() {
        stage = "provider_settings";
        const response = await fetch(new URL("/auth/v1/settings", url), {
          headers: { apikey: key },
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        return response.ok && (await response.json()).external?.google === true;
      },
      reserve: () => {
        stage = "quota_database";
        return reserveSignup(
          getDb(),
          signupNetworkHash(request.headers),
          googleIntentScope,
        );
      },
      async discard(token) {
        try {
          await discardSignupPermit(getDb(), token);
        } catch (error) {
          stage = "permit_cleanup";
          throw error;
        }
      },
      async authorize() {
        stage = "oauth_provider";
        const { data, error } = await client.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: callback.toString(),
            skipBrowserRedirect: true,
            queryParams: { prompt: "select_account" },
          },
        });
        if (error || !data.url)
          throw new AuthFlowError(
            "Could not start Google sign-in. Please try again.",
            503,
          );
        return data.url;
      },
    });
    stage = "session_cookies";
    (await cookies()).set(
      "rr_auth_next",
      safeReturnPath(request.headers.get("x-review-return-to")),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/auth/callback",
        maxAge: 300,
      },
    );
    (await cookies()).set(googleIntentCookie, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/auth/callback",
      maxAge: 300,
    });
    return NextResponse.json({ redirectTo: result.redirectTo }, { headers });
  } catch (error) {
    const failure = authFailure(error, {
      operation: "google",
      stage,
      fallback: "Could not start Google sign-in. Please try again.",
    });
    return NextResponse.json(failure.body, {
      status: failure.status,
      headers: {
        ...headers,
        ...(failure.retryAfter
          ? { "Retry-After": String(failure.retryAfter) }
          : {}),
      },
    });
  }
}
