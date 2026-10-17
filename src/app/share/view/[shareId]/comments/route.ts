import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AccessError } from "@/lib/auth/errors";
import { getDb } from "@/lib/server/db";
import { withCapabilityDatabase, sharedComments } from "@/lib/data/sharing";
import { limitCapability } from "@/features/sharing/rate-limit";
import { capabilityHeaders, capabilityFailure } from "@/features/sharing/http";
import { boundedInteger } from "@/features/comments/validation";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ shareId: string }> },
) {
  try {
    const db = getDb();
    await limitCapability(db, request.headers, "read");
    const { shareId } = await context.params,
      token = (await cookies()).get("rr_share")?.value;
    if (!token) throw new AccessError("Share unavailable.", 404);
    const query = new URL(request.url).searchParams;
    const data = await withCapabilityDatabase(db, (tx) =>
      sharedComments(
        tx,
        shareId,
        token,
        boundedInteger(query.get("after")),
        query.get("rootId") || undefined,
        query.get("afterReply") || undefined,
      ),
    );
    return NextResponse.json(data, { headers: capabilityHeaders });
  } catch (error) {
    return capabilityFailure(error);
  }
}
