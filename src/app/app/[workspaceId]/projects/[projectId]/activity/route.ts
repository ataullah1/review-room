import { ZodError } from "zod";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { requireSameOrigin } from "@/lib/auth/validation";
import { AccessError } from "@/lib/auth/errors";
import { getDb } from "@/lib/server/db";
import { withUserDatabase } from "@/lib/data/context";
import { activityPage, markActivityRead } from "@/lib/data/activity";
import { markActivityInput } from "@/features/activity/validation";
import { capabilityHeaders, readCapabilityJson } from "@/features/sharing/http";
function activityFailure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof AccessError
          ? error.message
          : error instanceof ZodError
            ? "Invalid activity request. Refresh and try again."
            : "Could not load or update activity. Please try again.",
    },
    {
      status:
        error instanceof AccessError
          ? error.status
          : error instanceof ZodError
            ? 400
            : 503,
      headers: capabilityHeaders,
    },
  );
}
export const runtime = "nodejs";
type Context = { params: Promise<{ workspaceId: string; projectId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser(),
      { workspaceId, projectId } = await context.params;
    const data = await withUserDatabase(getDb(), user.id, (tx) =>
      activityPage(
        tx,
        user.id,
        workspaceId,
        projectId,
        new URL(request.url).searchParams.get("before") || undefined,
      ),
    );
    return NextResponse.json(data, { headers: capabilityHeaders });
  } catch (error) {
    return activityFailure(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    if (!requireSameOrigin(request.headers))
      throw new AccessError("Request origin is not allowed.");
    const user = await requireUser(),
      { workspaceId, projectId } = await context.params,
      { through } = markActivityInput.parse(await readCapabilityJson(request));
    const data = await withUserDatabase(getDb(), user.id, (tx) =>
      markActivityRead(tx, user.id, workspaceId, projectId, through),
    );
    return NextResponse.json(data, { headers: capabilityHeaders });
  } catch (error) {
    return activityFailure(error);
  }
}
