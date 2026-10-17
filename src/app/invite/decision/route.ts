import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/user";
import { requireSameOrigin } from "@/lib/auth/validation";
import { AccessError } from "@/lib/auth/errors";
import { getDb } from "@/lib/server/db";
import { withUserDatabase } from "@/lib/data/context";
import { acceptInvitation } from "@/lib/data/sharing";
import { limitCapability } from "@/features/sharing/rate-limit";
import { capabilityHeaders, capabilityFailure } from "@/features/sharing/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (!requireSameOrigin(request.headers))
      throw new AccessError("Request origin is not allowed.");
    const db = getDb();
    await limitCapability(db, request.headers, "accept");
    const user = await requireUser(),
      token = (await cookies()).get("rr_invite")?.value;
    if (!token) throw new AccessError("Open your invitation link again.", 404);
    const result = await withUserDatabase(db, user.id, (tx) =>
      acceptInvitation(tx, token, user),
    );
    return NextResponse.json(
      { redirectTo: `/app/${result.workspaceId}/projects/${result.projectId}` },
      { headers: capabilityHeaders },
    );
  } catch (e) {
    return capabilityFailure(e);
  }
}
