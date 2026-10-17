import { NextResponse, type NextRequest } from "next/server";
import { createAuthClient } from "@/lib/auth/supabase";
import { identityFromUser } from "@/lib/auth/user";
import { safeReturnPath } from "@/lib/auth/validation";
import { bootstrapWorkspace } from "@/lib/data/bootstrap";
import { getDb } from "@/lib/server/db";

export async function GET(request: NextRequest) {
  const destination = new URL(process.env.NEXT_PUBLIC_APP_URL!);
  let path = "/login?error=callback";
  try {
    const code = request.nextUrl.searchParams.get("code");
    if (code) {
      const client = await createAuthClient(true);
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) {
        const { data, error: userError } = await client.auth.getUser();
        if (userError || !data.user)
          throw new Error("Unauthenticated callback");
        await bootstrapWorkspace(getDb(), identityFromUser(data.user));
        path = safeReturnPath(request.nextUrl.searchParams.get("next"));
      }
    }
  } catch {
    /* No provider errors, callback codes or tokens are logged. */
  }
  return NextResponse.redirect(new URL(path, destination), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
