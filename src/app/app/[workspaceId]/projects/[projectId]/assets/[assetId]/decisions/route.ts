import { dispatchMail } from "@/features/notifications/dispatch";
import { after, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireUser } from "@/lib/auth/user";
import { requireSameOrigin } from "@/lib/auth/validation";
import { AccessError } from "@/lib/auth/errors";
import { getDb } from "@/lib/server/db";
import { withUserDatabase } from "@/lib/data/context";
import { decisionPage, submitDecision } from "@/lib/data/reviews";
import { boundedInteger } from "@/features/comments/validation";
import { mutationFailure } from "@/lib/server/diagnostics";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
};
type Context = {
  params: Promise<{ workspaceId: string; projectId: string; assetId: string }>;
};
function failure(error: unknown, operation = "decision") {
  if (error instanceof AccessError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status, headers },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Choose a decision and provide a note when requesting changes.",
      },
      { status: 400, headers },
    );
  }
  const result = mutationFailure(error, {
    domain: "reviews",
    operation,
    stage: "decision_store",
    fallback: "Could not load or save the review. Please try again.",
  });
  return NextResponse.json(result.body, {
    status: result.status,
    headers,
  });
}
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) {
  try {
    const { workspaceId, projectId, assetId } = await context.params,
      user = await requireUser(),
      query = new URL(request.url).searchParams,
      versionId = z.uuid().parse(query.get("versionId"));
    return NextResponse.json(
      await withUserDatabase(getDb(), user.id, (tx) =>
        decisionPage(
          tx,
          user.id,
          workspaceId,
          projectId,
          assetId,
          versionId,
          boundedInteger(query.get("before")) || undefined,
        ),
      ),
      { headers },
    );
  } catch (error) {
    return failure(error, "read");
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
      user = await requireUser();
    const reader = request.body?.getReader();
    if (!reader) throw new AccessError("Invalid review request.", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 16384)
          throw new AccessError("Review request is too large.", 413);
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    let input: unknown;
    try {
      input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new AccessError("Invalid review request.", 400);
    }
    const decision = await withUserDatabase(getDb(), user.id, (tx) =>
      submitDecision(tx, user.id, workspaceId, projectId, assetId, input),
    );
    after(() => dispatchMail(getDb(), undefined, 2).catch(() => undefined));
    return NextResponse.json({ decision }, { headers });
  } catch (error) {
    return failure(error, "read");
  }
}
