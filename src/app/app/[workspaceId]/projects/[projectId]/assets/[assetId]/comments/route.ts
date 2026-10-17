import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { requireUser } from "@/lib/auth/user";
import { requireSameOrigin } from "@/lib/auth/validation";
import { AccessError } from "@/lib/auth/errors";
import { withUserDatabase } from "@/lib/data/context";
import { getDb } from "@/lib/server/db";
import {
  threadPage,
  replyPage,
  createComment,
  resolveComment,
} from "@/lib/data/comments";
import {
  boundedInteger,
  commentMutation,
} from "@/features/comments/validation";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
};
type Context = {
  params: Promise<{ workspaceId: string; projectId: string; assetId: string }>;
};
function failure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof AccessError
          ? error.message
          : error instanceof ZodError
            ? "Check your comment and pin position."
            : "Could not load or save feedback. Please try again.",
    },
    {
      status:
        error instanceof AccessError
          ? error.status
          : error instanceof ZodError
            ? 400
            : 503,
      headers,
    },
  );
}
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) {
  try {
    const { workspaceId, projectId, assetId } = await context.params,
      user = await requireUser(),
      query = new URL(request.url).searchParams,
      versionId = z.uuid().parse(query.get("versionId"));
    const rootId = query.get("rootId");
    const data = await withUserDatabase<
      | Awaited<ReturnType<typeof replyPage>>
      | Awaited<ReturnType<typeof threadPage>>
    >(getDb(), user.id, (tx) =>
      rootId
        ? replyPage(
            tx,
            user.id,
            workspaceId,
            projectId,
            assetId,
            versionId,
            rootId,
            query.get("afterReply") || undefined,
          )
        : threadPage(
            tx,
            user.id,
            workspaceId,
            projectId,
            assetId,
            versionId,
            boundedInteger(query.get("after")),
          ),
    );
    return NextResponse.json(data, { headers });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request, context: Context) {
  if (!requireSameOrigin(request.headers))
    return NextResponse.json(
      { error: "Request origin is not allowed." },
      { status: 403, headers },
    );
  try {
    const { workspaceId, projectId, assetId } = await context.params,
      user = await requireUser(),
      query = new URL(request.url).searchParams,
      versionId = z.uuid().parse(query.get("versionId"));
    const reader = request.body?.getReader();
    if (!reader) throw new AccessError("Invalid comment request.", 400);
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 16384)
          throw new AccessError("Comment request is too large.", 413);
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    let json;
    try {
      json = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new AccessError("Invalid comment request.", 400);
    }
    const input = commentMutation.parse(json);
    const comment = await withUserDatabase(getDb(), user.id, (tx) =>
      input.operation === "create"
        ? createComment(
            tx,
            user.id,
            workspaceId,
            projectId,
            assetId,
            versionId,
            input.input,
          )
        : resolveComment(
            tx,
            user.id,
            workspaceId,
            projectId,
            assetId,
            versionId,
            input.id,
            input.resolved,
          ),
    );
    return NextResponse.json({ comment }, { headers });
  } catch (error) {
    return failure(error);
  }
}
