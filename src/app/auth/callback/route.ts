import { createHash, randomBytes } from "node:crypto";
import { recordEmailProof } from "@/lib/auth/email-proof";
import {
  recoveryStartCookie,
  recoveryGrantCookie,
  readAuthIntent,
  signAuthIntent,
  intentCookieOptions,
} from "@/lib/auth/intent";
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
            if (
              !error &&
              data.user?.email &&
              data.user.identities?.some(
                (i) =>
                  i.provider === "google" &&
                  i.identity_data?.email_verified === true,
              )
            )
              await recordEmailProof(data.user.id, data.user.email);
            return !error &&
              data.user?.identities?.some(
                (identity) => identity.provider === "google",
              )
              ? identityFromUser(data.user)
              : null;
          },
          bootstrap: (user) =>
            bootstrapWithQuota(
              getDb(),
              user,
              request.headers,
              true,
              nextCookie === "/invite/accept",
            ),
        },
      );
    } catch {
      // Never expose provider errors, codes or tokens.
    } finally {
      await discardSignupPermit(getDb(), token).catch(() => undefined);
    }
  } else {
    const code = request.nextUrl.searchParams.get("code");
    const tokenHash = request.nextUrl.searchParams.get("token_hash");
    const type = request.nextUrl.searchParams.get("type");
    const recovery = type === "recovery";
    path = recovery ? "/login?error=recovery" : "/login?error=verification";
    try {
      const client = await createAuthClient(true);
      if (request.nextUrl.searchParams.has("error"))
        throw new Error("Provider declined callback");
      if (code) {
        const { error } = await client.auth.exchangeCodeForSession(code);
        if (error) throw error;
      } else if (
        tokenHash &&
        ["signup", "magiclink", "email", "recovery"].includes(type || "")
      ) {
        const { error } = await client.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as EmailOtpType,
        });
        if (error) throw error;
      } else throw new Error("Missing callback proof");
      const { data, error } = await client.auth.getUser();
      if (error || !data.user?.email || !data.user.email_confirmed_at)
        throw new Error("Unverified identity");
      const user = identityFromUser(data.user);
      // A successfully exchanged provider code/token is proof; password login
      // and legacy auto-confirm timestamps alone never reach this path.
      await recordEmailProof(user.id, data.user.email);
      if (recovery) {
        const intent = readAuthIntent(
          jar.get(recoveryStartCookie)?.value,
          "recovery-start",
        );
        if (code && intent?.email !== data.user.email)
          throw new Error("Recovery intent mismatch");
        const { data: claims } = await client.auth.getClaims();
        const sessionId = claims?.claims.session_id;
        if (typeof sessionId !== "string")
          throw new Error("No verified session");
        const nonce = randomBytes(32).toString("hex");
        await getDb()
          .$executeRaw`INSERT INTO app."RecoveryGrant"("tokenHash","userId","sessionId","expiresAt") VALUES(${createHash("sha256").update(nonce).digest("hex")},${user.id}::uuid,${sessionId},NOW()+INTERVAL '10 minutes')`;
        jar.set(
          recoveryGrantCookie,
          signAuthIntent({
            kind: "recovery-grant",
            email: data.user.email,
            userId: user.id,
            sessionId,
            nonce,
            expires: Date.now() + 600_000,
          }),
          intentCookieOptions,
        );
        jar.set(recoveryStartCookie, "", { ...intentCookieOptions, maxAge: 0 });
        path = "/reset-password";
      } else {
        await bootstrapWithQuota(
          getDb(),
          user,
          request.headers,
          false,
          safeReturnPath(
            request.nextUrl.searchParams.get("next") || nextCookie,
          ) === "/invite/accept",
        );
        path = "/app";
      }
    } catch {
      /* Return only a fixed error route, never provider tokens/errors. */
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
