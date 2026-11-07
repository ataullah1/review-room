import { dispatchMail } from "@/features/notifications/dispatch";
import { after, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { requireSameOrigin } from "@/lib/auth/validation";
import { AccessError } from "@/lib/auth/errors";
import { getDb } from "@/lib/server/db";
import { withUserDatabase } from "@/lib/data/context";
import { requestReview } from "@/lib/data/review-rounds";
import {
  capabilityFailure,
  capabilityHeaders,
  readCapabilityJson,
} from "@/features/sharing/http";
export async function POST(
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
    if (!requireSameOrigin(request.headers))
      throw new AccessError("Request origin is not allowed.");
    const user = await requireUser(),
      p = await context.params,
      input = await readCapabilityJson(request, 8192);
    const result = await withUserDatabase(getDb(), user.id, (tx) =>
      requestReview(tx, user.id, p.workspaceId, p.projectId, p.assetId, input),
    );
    after(() => dispatchMail(getDb(), undefined, 2).catch(() => undefined));
    return NextResponse.json(result, { headers: capabilityHeaders });
  } catch (error) {
    return capabilityFailure(error);
  }
}
