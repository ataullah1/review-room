import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { requireSameOrigin } from "@/lib/auth/validation";
import { getDb } from "@/lib/server/db";
import { withUserDatabase } from "@/lib/data/context";
import { changeCompletion } from "@/lib/data/completion";
import { AccessError } from "@/lib/auth/errors";
import {
  capabilityFailure,
  capabilityHeaders,
  readCapabilityJson,
} from "@/features/sharing/http";
export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string; projectId: string }> },
) {
  try {
    if (!requireSameOrigin(request.headers))
      throw new AccessError("Request origin is not allowed.");
    const user = await requireUser(),
      p = await context.params,
      input = await readCapabilityJson(request);
    const result = await withUserDatabase(getDb(), user.id, (tx) =>
      changeCompletion(tx, user.id, p.workspaceId, p.projectId, input),
    );
    return NextResponse.json(result, { headers: capabilityHeaders });
  } catch (e) {
    return capabilityFailure(e);
  }
}
