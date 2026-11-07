import { requireUser } from "@/lib/auth/user";
import { withUserDatabase } from "@/lib/data/context";
import { getDb } from "@/lib/server/db";
import { getUploadStorage } from "@/lib/server/uploads";
import { deliverySnapshot } from "@/lib/data/completion";
import { AccessError } from "@/lib/auth/errors";
import { capabilityFailure, capabilityHeaders } from "@/features/sharing/http";
import { NextResponse } from "next/server";
// Original downloads redirect to a short-lived attachment capability. No 10 MB
// image is buffered through a serverless response or embedded in a JSON export.
export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string; projectId: string }> },
) {
  try {
    const p = await context.params,
      user = await requireUser(),
      q = new URL(request.url).searchParams;
    const signed = await withUserDatabase(getDb(), user.id, async (tx) => {
      const data = await deliverySnapshot(
        tx,
        user.id,
        p.workspaceId,
        p.projectId,
        q.get("completionId") || undefined,
      );
      const file = data.snapshot?.manifest.files.find(
        (f) => f.versionId === q.get("versionId"),
      );
      if (!file) throw new AccessError("Approved original not found.", 404);
      const row = await tx.assetVersion.findFirst({
        where: {
          id: file.versionId,
          projectId: p.projectId,
          workspaceId: p.workspaceId,
          status: "READY",
          contentHash: file.contentHash,
        },
      });
      if (!row)
        throw new AccessError(
          "Approved original is unavailable. Contact the owner.",
          404,
        );
      return getUploadStorage().signRead(row.objectKey, file.originalName);
    });
    return NextResponse.redirect(signed, {
      status: 307,
      headers: capabilityHeaders,
    });
  } catch (e) {
    return capabilityFailure(e);
  }
}
