import { dispatchMail } from "@/features/notifications/dispatch";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/user";
import { requireSameOrigin } from "@/lib/auth/validation";
import { AccessError } from "@/lib/auth/errors";
import { getDb } from "@/lib/server/db";
import { withUserDatabase } from "@/lib/data/context";
import {
  createInvitation,
  replaceInvitation,
  listInvitations,
  revokeInvitation,
} from "@/lib/data/sharing";
import {
  capabilityHeaders,
  capabilityFailure,
  readCapabilityJson,
} from "@/features/sharing/http";
type Context = { params: Promise<{ workspaceId: string; projectId: string }> };
export const runtime = "nodejs";
export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireUser(),
      { workspaceId, projectId } = await context.params;
    const invitations = await withUserDatabase(getDb(), user.id, (tx) =>
      listInvitations(tx, user.id, workspaceId, projectId),
    );
    return NextResponse.json({ invitations }, { headers: capabilityHeaders });
  } catch (e) {
    return capabilityFailure(e);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    if (!requireSameOrigin(request.headers))
      throw new AccessError("Request origin is not allowed.");
    const user = await requireUser(),
      { workspaceId, projectId } = await context.params,
      input = await readCapabilityJson(request);
    const data = z
      .discriminatedUnion("operation", [
        z.object({
          operation: z.literal("create"),
          email: z.string(),
          role: z.string(),
        }),
        z.object({ operation: z.literal("revoke"), id: z.uuid() }),
        z.object({ operation: z.literal("replace"), id: z.uuid() }),
      ])
      .parse(input);
    const result = await withUserDatabase<unknown>(getDb(), user.id, (tx) =>
      data.operation === "create"
        ? createInvitation(tx, user.id, workspaceId, projectId, data)
        : data.operation === "replace"
          ? replaceInvitation(tx, user.id, workspaceId, projectId, data.id)
          : revokeInvitation(tx, user.id, workspaceId, projectId, data.id),
    );
    after(() => dispatchMail(getDb(), undefined, 2).catch(() => undefined));
    return NextResponse.json(result, { headers: capabilityHeaders });
  } catch (e) {
    return capabilityFailure(e);
  }
}
