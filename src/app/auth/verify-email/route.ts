import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/auth/supabase";
import { requireUser } from "@/lib/auth/user";
import { requireSameOrigin } from "@/lib/auth/validation";
import { readAppOrigin } from "@/lib/config/deployment";
import { getDb } from "@/lib/server/db";
import { limitCapability } from "@/features/sharing/rate-limit";
import { capabilityFailure, capabilityHeaders } from "@/features/sharing/http";
import { AccessError } from "@/lib/auth/errors";
export async function POST(request: Request) {
  try {
    if (!requireSameOrigin(request.headers))
      throw new AccessError("Request origin is not allowed.");
    const user = await requireUser();
    if (!user.email)
      throw new AccessError("An email address is required.", 400);
    await limitCapability(getDb(), request.headers, "accept");
    const client = await createAuthClient(true);
    const { error } = await client.auth.signInWithOtp({
      email: user.email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${readAppOrigin()}/auth/callback?next=%2Finvite%2Faccept`,
      },
    });
    if (error)
      throw new AccessError(
        "Could not send verification. Please try again later.",
        503,
      );
    return NextResponse.json(
      {
        message:
          "Check your email and open the verification link, then accept the invitation.",
      },
      { headers: capabilityHeaders },
    );
  } catch (error) {
    return capabilityFailure(error);
  }
}
