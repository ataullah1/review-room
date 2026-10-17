import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/user";
import { requireSameOrigin } from "@/lib/auth/validation";
import { AccessError } from "@/lib/auth/errors";
import { getDb } from "@/lib/server/db";
import { withUserDatabase } from "@/lib/data/context";
import { createShare, listShares, revokeShare } from "@/lib/data/sharing";
import {
  capabilityHeaders,
  capabilityFailure,
  readCapabilityJson,
} from "@/features/sharing/http";
type Context = {
  params: Promise<{ workspaceId: string; projectId: string; assetId: string }>;
};
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser(),
      { workspaceId, projectId, assetId } = await context.params,
      versionId = z
        .uuid()
        .parse(new URL(request.url).searchParams.get("versionId"));
    const shares = await withUserDatabase(getDb(), user.id, (tx) =>
      listShares(tx, user.id, workspaceId, projectId, assetId, versionId),
    );
    return NextResponse.json({ shares }, { headers: capabilityHeaders });
  } catch (e) {
    return capabilityFailure(e);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    if (!requireSameOrigin(request.headers))
      throw new AccessError("Request origin is not allowed.");
    const user = await requireUser(),
      { workspaceId, projectId, assetId } = await context.params,
      data = z
        .object({
          operation: z.enum(["create", "revoke"]),
          versionId: z.uuid(),
          id: z.uuid().optional(),
        })
        .parse(await readCapabilityJson(request));
    const result = await withUserDatabase<unknown>(getDb(), user.id, (tx) =>
      data.operation === "create"
        ? createShare(
            tx,
            user.id,
            workspaceId,
            projectId,
            assetId,
            data.versionId,
          )
        : revokeShare(
            tx,
            user.id,
            workspaceId,
            projectId,
            assetId,
            data.versionId,
            z.uuid().parse(data.id),
          ),
    );
    return NextResponse.json(result, { headers: capabilityHeaders });
  } catch (e) {
    return capabilityFailure(e);
  }
}
