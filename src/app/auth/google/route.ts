import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { authConfiguration, createAuthClient } from "@/lib/auth/supabase";
import { requireSameOrigin } from "@/lib/auth/validation";
import {
  beginGoogle,
  googleIntentCookie,
  googleIntentScope,
} from "@/lib/auth/google";
import { signupNetworkHash } from "@/lib/auth/ip";
import { reserveSignup, discardSignupPermit } from "@/lib/auth/rate-limit";
import { AuthFlowError } from "@/lib/auth/errors";
import { getDb } from "@/lib/server/db";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  if (!requireSameOrigin(request.headers))
    return NextResponse.json(
      { error: "Request origin is not allowed." },
      { status: 403, headers },
    );
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
        const response = await fetch(new URL("/auth/v1/settings", url), {
          headers: { apikey: key },
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        return response.ok && (await response.json()).external?.google === true;
      },
      reserve: () =>
        reserveSignup(
          getDb(),
          signupNetworkHash(request.headers),
          googleIntentScope,
        ),
      discard: (token) => discardSignupPermit(getDb(), token),
      async authorize() {
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
    (await cookies()).set(googleIntentCookie, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/auth/callback",
      maxAge: 300,
    });
    return NextResponse.json({ redirectTo: result.redirectTo }, { headers });
  } catch (error) {
    const known = error instanceof AuthFlowError;
    return NextResponse.json(
      {
        error: known
          ? error.message
          : "Could not start Google sign-in. Please try again.",
      },
      {
        status: known ? error.status : 503,
        headers: {
          ...headers,
          ...(known && error.retryAfter
            ? { "Retry-After": String(error.retryAfter) }
            : {}),
        },
      },
    );
  }
}
