import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { AccessError } from "@/lib/auth/errors";
import { getDb } from "@/lib/server/db";
import { withUserDatabase } from "@/lib/data/context";
import { versionPage } from "@/lib/data/reviews";
import { boundedInteger } from "@/features/comments/validation";
export const runtime = "nodejs";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
};
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
    return NextResponse.json(
      await withUserDatabase(getDb(), user.id, (tx) =>
        versionPage(
          tx,
          user.id,
          workspaceId,
          projectId,
          assetId,
          boundedInteger(new URL(request.url).searchParams.get("before")) ||
            undefined,
        ),
      ),
      { headers },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof AccessError
            ? error.message
            : "Could not load versions. Please try again.",
      },
      { status: error instanceof AccessError ? error.status : 503, headers },
    );
  }
}
