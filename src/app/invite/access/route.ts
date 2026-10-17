import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { requireSameOrigin } from "@/lib/auth/validation";
import { AccessError } from "@/lib/auth/errors";
import { getDb } from "@/lib/server/db";
import { withCapabilityDatabase, inspectInvitation } from "@/lib/data/sharing";
import { tokenInput } from "@/features/sharing/tokens";
import { limitCapability } from "@/features/sharing/rate-limit";
import {
  capabilityHeaders,
  capabilityFailure,
  readCapabilityJson,
} from "@/features/sharing/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (!requireSameOrigin(request.headers))
      throw new AccessError("Request origin is not allowed.");
    const db = getDb();
    await limitCapability(db, request.headers, "exchange");
    const { token } = z
      .object({ token: tokenInput })
      .parse(await readCapabilityJson(request));
    const data = await withCapabilityDatabase(db, (tx) =>
      inspectInvitation(tx, token),
    );
    const path = "/invite";
    (await cookies()).set("rr_invite", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path,
      maxAge: Math.max(
        1,
        Math.min(
          604800,
          Math.floor((new Date(data.expiresAt).getTime() - Date.now()) / 1000),
        ),
      ),
    });
    return NextResponse.json(
      { redirectTo: "/invite/accept" },
      { headers: capabilityHeaders },
    );
  } catch (e) {
    return capabilityFailure(e);
  }
}
