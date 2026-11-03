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
import { readAppOrigin } from "@/lib/config/deployment";
import { safeReturnPath } from "@/lib/auth/validation";
import type { EmailOtpType } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const jar = await cookies();
  const token = jar.get(googleIntentCookie)?.value;
  const nextCookie = jar.get("rr_auth_next")?.value;
  jar.set("rr_auth_next", "", {
    path: "/auth/callback",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  jar.set(googleIntentCookie, "", {
    path: "/auth/callback",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  let path = "/login?error=callback";

  if (token) {
    // Google OAuth flow
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
      await discardSignupPermit(getDb(), token).catch(() => undefined);
    }
  } else {
    // Email verification or password recovery flow (PKCE code or OTP token_hash)
    const code = request.nextUrl.searchParams.get("code");
    const tokenHash = request.nextUrl.searchParams.get("token_hash");
    const type = request.nextUrl.searchParams.get("type");
    const isRecovery = type === "recovery";
    const failurePath = isRecovery
      ? "/login?error=recovery"
      : "/login?error=verification";
    const hasError = request.nextUrl.searchParams.has("error");

    if (hasError) {
      path = failurePath;
    } else if (code) {
      try {
        const client = await createAuthClient(true);
        const { error: exchangeError } =
          await client.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          path = failurePath;
        } else {
          const { data, error: userError } = await client.auth.getUser();
          if (!userError && data.user) {
            if (isRecovery) {
              path = "/reset-password";
            } else {
              const user = identityFromUser(data.user);
              await bootstrapWithQuota(getDb(), user, request.headers, false);
              path = "/app";
            }
          } else {
            path = failurePath;
          }
        }
      } catch {
        path = failurePath;
      }
    } else if (tokenHash && type) {
      try {
        const client = await createAuthClient(true);
        const { error: otpError } = await client.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as EmailOtpType,
        });
        if (otpError) {
          path = failurePath;
        } else {
          const { data, error: userError } = await client.auth.getUser();
          if (!userError && data.user) {
            if (isRecovery) {
              path = "/reset-password";
            } else {
              const user = identityFromUser(data.user);
              await bootstrapWithQuota(getDb(), user, request.headers, false);
              path = "/app";
            }
          } else {
            path = failurePath;
          }
        }
      } catch {
        path = failurePath;
      }
    } else {
      path = failurePath;
    }
  }

  const queryNext = request.nextUrl.searchParams.get("next");
  const returnTarget = queryNext || nextCookie;
  if (path.startsWith("/app") && returnTarget) {
    path = safeReturnPath(returnTarget);
  }

  return NextResponse.redirect(new URL(path, readAppOrigin()), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
