import { requireUser } from "@/lib/auth/user";
import { withUserDatabase } from "@/lib/data/context";
import { getDb } from "@/lib/server/db";
import { deliverySnapshot } from "@/lib/data/completion";
import { AccessError } from "@/lib/auth/errors";
import { capabilityFailure, capabilityHeaders } from "@/features/sharing/http";
export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string; projectId: string }> },
) {
  try {
    const p = await context.params,
      user = await requireUser();
    const data = await withUserDatabase(getDb(), user.id, (tx) =>
      deliverySnapshot(
        tx,
        user.id,
        p.workspaceId,
        p.projectId,
        new URL(request.url).searchParams.get("completionId") || undefined,
      ),
    );
    if (!data.snapshot)
      throw new AccessError("Completed delivery not found.", 404);
    const snapshot = data.snapshot;
    return Response.json(
      {
        completionId: snapshot.id,
        completedAt: snapshot.createdAt.toISOString(),
        completedBy: snapshot.completedByName,
        ...snapshot.manifest,
      },
      {
        headers: {
          ...capabilityHeaders,
          "Content-Disposition":
            "attachment; filename=review-room-delivery.json",
        },
      },
    );
  } catch (e) {
    return capabilityFailure(e);
  }
}
