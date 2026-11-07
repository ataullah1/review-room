import { randomUUID } from "node:crypto";
import type { UserDatabase } from "@/lib/data/context";
import { mailEnabled, sealMail } from "./crypto";
export type MailPayload = {
  invitationId?: string;
  token?: string;
  email?: string;
};
export async function enqueueMail(
  tx: UserDatabase,
  input: {
    workspaceId: string;
    projectId: string;
    kind: "INVITATION" | "REVIEW_READY" | "COMMENT" | "DECISION";
    recipientId?: string;
    sourceId: string;
    payload?: MailPayload;
    expiresAt?: Date;
  },
) {
  if (!mailEnabled()) return false;
  const dedupe = `${input.kind}:${input.sourceId}:${input.recipientId || "invite"}`;
  const encrypted = sealMail(
    input.payload || {},
    process.env.MAIL_PAYLOAD_SECRET!,
  );
  await tx.$queryRaw`SELECT app.enqueue_notification(${randomUUID()}::uuid,${dedupe},${input.workspaceId}::uuid,${input.projectId}::uuid,${input.kind},${input.recipientId || null}::uuid,${input.sourceId}::uuid,${encrypted},${input.expiresAt || new Date(Date.now() + 86400_000)}::timestamptz)::text`;
  // Owner invitation responses must not claim queued delivery when the durable
  // capacity guard skipped a job. Other event callers do not expose job rows.
  if (input.kind === "INVITATION")
    return !!(await tx.notificationJob.findUnique({
      where: { dedupeKey: dedupe },
      select: { id: true },
    }));
  return true;
}
export async function enqueueProjectEvent(
  tx: UserDatabase,
  workspaceId: string,
  projectId: string,
  actorId: string,
  kind: "COMMENT" | "DECISION",
  sourceId: string,
) {
  if (!mailEnabled()) return;
  const members = await tx.$queryRaw<
    { userId: string }[]
  >`SELECT * FROM app.project_notification_recipients(${projectId}::uuid)`;
  for (const { userId } of members)
    if (userId !== actorId)
      await enqueueMail(tx, {
        workspaceId,
        projectId,
        kind,
        recipientId: userId,
        sourceId,
      });
}
