import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { requireSameOrigin } from "@/lib/auth/validation";
import { AccessError } from "@/lib/auth/errors";
import { getDb } from "@/lib/server/db";
import { withCapabilityDatabase, exchangeShare } from "@/lib/data/sharing";
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
      exchangeShare(tx, token),
    );
    const path = `/share/view/${data.id}`;
    (await cookies()).set("rr_share", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path,
      maxAge: Math.max(
        1,
        Math.min(
          86400,
          Math.floor((new Date(data.expiresAt).getTime() - Date.now()) / 1000),
        ),
      ),
    });
    return NextResponse.json(
      { redirectTo: path },
      { headers: capabilityHeaders },
    );
  } catch (e) {
    return capabilityFailure(e);
  }
}
