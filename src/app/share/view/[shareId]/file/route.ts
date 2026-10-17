import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AccessError } from "@/lib/auth/errors";
import { getDb } from "@/lib/server/db";
import { withCapabilityDatabase, readShare } from "@/lib/data/sharing";
import { limitCapability } from "@/features/sharing/rate-limit";
import { capabilityHeaders, capabilityFailure } from "@/features/sharing/http";
import { getUploadStorage } from "@/lib/server/uploads";
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
    const url = await withCapabilityDatabase(db, async (tx) => {
      const version = await readShare(tx, shareId, token);
      return getUploadStorage().signRead(version.objectKey);
    });
    return NextResponse.redirect(url, {
      status: 307,
      headers: capabilityHeaders,
    });
  } catch (error) {
    return capabilityFailure(error);
  }
}
