import type { UserDatabase } from "./context";
import type { ActivityPage } from "../../features/activity/types";
import { activityCursor } from "../../features/activity/validation";
import { requireProjectAccess } from "./permissions";
import { AccessError } from "../auth/errors";
async function lockProjectActivity(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
) {
  // Keep the feed's high-water mark and unread updates in one project order.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`project:${projectId.toLowerCase()}`},0))::text`;
  await requireProjectAccess(tx, userId, workspaceId, projectId);
}

export async function activityPage(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  before?: string,
): Promise<ActivityPage> {
  await lockProjectActivity(tx, userId, workspaceId, projectId);
  const scope = { projectId, workspaceId };
  if (before) {
    activityCursor.parse(before);
    if (
      !(await tx.activityEvent.findFirst({
        where: { ...scope, id: BigInt(before) },
        select: { id: true },
      }))
    )
      throw new AccessError("Activity cursor not found.", 404);
  }
  const state = await tx.projectActivityRead.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  const lastRead = state?.lastReadEventId || BigInt("0");
  const rows = await tx.activityEvent.findMany({
    where: { ...scope, ...(before ? { id: { lt: BigInt(before) } } : {}) },
    orderBy: { id: "desc" },
    take: 21,
  });
  const head = before
    ? await tx.activityEvent.findFirst({
        where: scope,
        orderBy: { id: "desc" },
        select: { id: true },
      })
    : rows[0];
  return {
    items: rows.slice(0, 20).map((row) => ({
      id: row.id.toString(),
      kind: row.kind,
      actorName: row.actorName,
      assetId: row.assetId,
      versionId: row.versionId,
      versionNumber: row.versionNumber,
      threadNumber: row.threadNumber,
      createdAt: row.createdAt.toISOString(),
      unread: row.id > lastRead,
    })),
    next: rows.length > 20 ? rows[19].id.toString() : null,
    headId: head?.id.toString() || "0",
    unreadCount: await tx.activityEvent.count({
      where: { ...scope, id: { gt: lastRead } },
    }),
    lastReadAt: state?.lastReadAt.toISOString() || null,
  };
}
export async function markActivityRead(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  through: string,
) {
  await lockProjectActivity(tx, userId, workspaceId, projectId);
  activityCursor.parse(through);
  const id = BigInt(through);
  if (
    id > BigInt("0") &&
    !(await tx.activityEvent.findFirst({
      where: { id, projectId, workspaceId },
      select: { id: true },
    }))
  )
    throw new AccessError("Refresh activity before marking it as read.", 409);
  // An older tab must not move the user's read position backwards.
  await tx.$executeRaw`
    INSERT INTO app."ProjectActivityRead" (
      "projectId", "workspaceId", "userId", "lastReadEventId", "lastReadAt"
    ) VALUES (
      ${projectId}::uuid, ${workspaceId}::uuid, ${userId}::uuid, ${id}, now()
    )
    ON CONFLICT ("projectId", "userId") DO UPDATE SET
      "lastReadEventId" = greatest(
        app."ProjectActivityRead"."lastReadEventId", EXCLUDED."lastReadEventId"
      ),
      "lastReadAt" = now()
  `;
  return activityPage(tx, userId, workspaceId, projectId);
}
