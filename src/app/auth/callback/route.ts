import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createAuthClient } from "@/lib/auth/supabase";
import { identityFromUser } from "@/lib/auth/user";
import { bootstrapWithQuota } from "@/lib/data/onboarding";
import {
  finishGoogle,
  googleIntentCookie,
  googleIntentScope,
} from "@/lib/auth/google";
import {
  consumeSignupPermit,
  discardSignupPermit,
} from "@/lib/auth/rate-limit";
import { getDb } from "@/lib/server/db";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const jar = await cookies();
  const token = jar.get(googleIntentCookie)?.value;
  jar.set(googleIntentCookie, "", {
    path: "/auth/callback",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  let path = "/login?error=callback";
  try {
    path = await finishGoogle(
      {
        code: request.nextUrl.searchParams.get("code"),
        token,
        providerError: request.nextUrl.searchParams.has("error"),
      },
      {
        consume: (value) =>
          consumeSignupPermit(getDb(), value, googleIntentScope),
        async exchange(code) {
          const client = await createAuthClient(true);
          return !(await client.auth.exchangeCodeForSession(code)).error;
        },
        async verifiedUser() {
          const client = await createAuthClient(true);
          const { data, error } = await client.auth.getUser();
          return !error &&
            data.user?.identities?.some(
              (identity) => identity.provider === "google",
            )
            ? identityFromUser(data.user)
            : null;
        },
        bootstrap: (user) =>
          bootstrapWithQuota(getDb(), user, request.headers, true),
      },
    );
  } catch {
    // Never expose provider errors, codes or tokens.
  } finally {
    if (token) await discardSignupPermit(getDb(), token).catch(() => undefined);
  }
  return NextResponse.redirect(
    new URL(path, process.env.NEXT_PUBLIC_APP_URL!),
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
