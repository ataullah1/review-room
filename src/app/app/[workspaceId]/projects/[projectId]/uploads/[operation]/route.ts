import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/user";
import { requireSameOrigin } from "@/lib/auth/validation";
import { getDb } from "@/lib/server/db";
import { getUploadStorage } from "@/lib/server/uploads";
import { uploadService } from "@/features/uploads/service";
import { cleanupUploads } from "@/features/uploads/cleanup";
import {
  readUploadJson,
  uploadFailure,
  uploadHeaders,
} from "@/features/uploads/http";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(
  request: Request,
  context: {
    params: Promise<{
      workspaceId: string;
      projectId: string;
      operation: string;
    }>;
  },
) {
  if (!requireSameOrigin(request.headers))
    return NextResponse.json(
      { error: "Request origin is not allowed." },
      { status: 403, headers: uploadHeaders },
    );
  const { workspaceId, projectId, operation } = await context.params;
  if (!["prepare", "finalize", "cancel"].includes(operation))
    return NextResponse.json(
      { error: "Not found." },
      { status: 404, headers: uploadHeaders },
    );
  try {
    const user = await requireUser(),
      input = await readUploadJson(request);
    const db = getDb(),
      storage = getUploadStorage(),
      service = uploadService(db, storage, user.id, workspaceId, projectId);
    let result;
    if (operation === "prepare") {
      result = await service.prepare(input);
      after(async () => {
        await cleanupUploads(db, storage, 2).catch(() => undefined);
      });
    } else {
      const { versionId } = z.object({ versionId: z.uuid() }).parse(input);
      result =
        operation === "finalize"
          ? await service.finalize(versionId)
          : await service.cancel(versionId);
    }
    return NextResponse.json(result, { headers: uploadHeaders });
  } catch (error) {
    const failure = uploadFailure(error);
    return NextResponse.json(
      { error: failure.error },
      { status: failure.status, headers: uploadHeaders },
    );
  }
}
