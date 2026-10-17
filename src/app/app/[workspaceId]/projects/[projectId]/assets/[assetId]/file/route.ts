import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { getDb } from "@/lib/server/db";
import { getUploadStorage } from "@/lib/server/uploads";
import { withUserDatabase } from "@/lib/data/context";
import { reviewVersion } from "@/lib/data/comments";
import { uploadFailure, uploadHeaders } from "@/features/uploads/http";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: {
    params: Promise<{
      workspaceId: string;
      projectId: string;
      assetId: string;
    }>;
  },
) {
  try {
    const { workspaceId, projectId, assetId } = await context.params,
      user = await requireUser();
    const asset = await withUserDatabase(getDb(), user.id, (tx) =>
      reviewVersion(
        tx,
        user.id,
        workspaceId,
        projectId,
        assetId,
        new URL(request.url).searchParams.get("versionId") || undefined,
      ),
    );
    const signed = await getUploadStorage().signRead(asset.version.objectKey);
    return NextResponse.redirect(signed, {
      status: 307,
      headers: uploadHeaders,
    });
  } catch (error) {
    const failure = uploadFailure(error);
    return NextResponse.json(
      { error: failure.error },
      { status: failure.status, headers: uploadHeaders },
    );
  }
}
