import { z } from "zod";
import type { Comment } from "../../generated/prisma/client";
import type { UserDatabase } from "./context";
import { AccessError } from "../auth/errors";
import { requireProjectAccess } from "./permissions";
import { createCommentSchema } from "../../features/comments/validation";
import type { CommentView, ThreadPage } from "../../features/comments/types";
export function commentView(row: Comment): CommentView {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() || null,
  };
}
export async function reviewVersion(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  assetId: string,
  versionId?: string,
) {
  const { project, member } = await requireProjectAccess(
    tx,
    userId,
    workspaceId,
    projectId,
  );
  if (
    !z.uuid().safeParse(assetId).success ||
    (versionId !== undefined && !z.uuid().safeParse(versionId).success)
  )
    throw new AccessError("Image not found.", 404);
  const asset = await tx.asset.findFirst({
    where: { id: assetId, workspaceId, projectId },
  });
  const selected = versionId || asset?.currentVersionId;
  if (!asset || !selected) throw new AccessError("Image not found.", 404);
  const version = await tx.assetVersion.findFirst({
    where: { id: selected, assetId, workspaceId, projectId, status: "READY" },
  });
  if (!version) throw new AccessError("Image version not found.", 404);
  return { asset, version, project, member };
}
async function writable(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  assetId: string,
  versionId: string,
) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`project:${projectId}`},0))::text`;
  const access = await reviewVersion(
    tx,
    userId,
    workspaceId,
    projectId,
    assetId,
    versionId,
  );
  if (access.project.archivedAt)
    throw new AccessError("Restore this project before adding feedback.", 409);
  if (access.asset.currentVersionId !== versionId)
    throw new AccessError(
      "This version is read only. Refresh and open the current version to leave feedback.",
      409,
    );
  return access;
}
export async function threadPage(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  assetId: string,
  versionId: string,
  after = 0,
): Promise<ThreadPage> {
  await reviewVersion(tx, userId, workspaceId, projectId, assetId, versionId);
  const where = { versionId, parentId: null };
  const total = await tx.comment.count({ where });
  const rows = await tx.comment.findMany({
    where: { ...where, threadNumber: { gt: after } },
    orderBy: { threadNumber: "asc" },
    take: 21,
    include: {
      replies: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 5 },
      _count: { select: { replies: true } },
    },
  });
  const visible = rows.slice(0, 20);
  return {
    total,
    next: rows.length > 20 ? visible.at(-1)!.threadNumber : null,
    threads: visible.map((row) => ({
      ...commentView(row),
      replies: row.replies.map(commentView),
      replyTotal: row._count.replies,
      replyCursor: row.replies.at(-1)?.id || null,
      moreReplies: row._count.replies > row.replies.length,
    })),
  };
}
export async function replyPage(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  assetId: string,
  versionId: string,
  rootId: string,
  after?: string,
) {
  await reviewVersion(tx, userId, workspaceId, projectId, assetId, versionId);
  if (
    !z.uuid().safeParse(rootId).success ||
    (after && !z.uuid().safeParse(after).success)
  )
    throw new AccessError("Thread not found.", 404);
  const parent = await tx.comment.findFirst({
    where: { id: rootId, versionId, parentId: null },
  });
  if (!parent) throw new AccessError("Thread not found.", 404);
  if (
    after &&
    !(await tx.comment.findFirst({
      where: { id: after, versionId, parentId: rootId },
    }))
  )
    throw new AccessError("Reply not found.", 404);
  const rows = await tx.comment.findMany({
    where: { versionId, parentId: rootId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 21,
    ...(after ? { cursor: { id: after }, skip: 1 } : {}),
  });
  return {
    replies: rows.slice(0, 20).map(commentView),
    next: rows.length > 20 ? rows[19].id : null,
  };
}
export async function createComment(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  assetId: string,
  versionId: string,
  input: unknown,
) {
  await writable(tx, userId, workspaceId, projectId, assetId, versionId);
  const data = createCommentSchema.parse(input);
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`comment:${data.id}`},0))::text`;
  const existing = await tx.comment.findUnique({ where: { id: data.id } });
  if (existing) {
    if (
      existing.authorId !== userId ||
      existing.versionId !== versionId ||
      existing.parentId !== data.parentId ||
      existing.body !== data.body ||
      existing.xRatio !== data.xRatio ||
      existing.yRatio !== data.yRatio
    )
      throw new AccessError(
        "This request was already used. Start a new comment.",
        409,
      );
    return commentView(existing);
  }
  let threadNumber: number | null = null;
  if (data.parentId) {
    if (
      !(await tx.comment.findFirst({
        where: { id: data.parentId, versionId, parentId: null },
      }))
    )
      throw new AccessError(
        "Reply to a root thread on this image version.",
        400,
      );
  } else {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`threads:${versionId}`},0))::text`;
    const last = await tx.comment.aggregate({
      where: { versionId, parentId: null },
      _max: { threadNumber: true },
    });
    threadNumber = (last._max.threadNumber || 0) + 1;
  }
  return commentView(
    await tx.comment.create({
      data: { ...data, versionId, authorId: userId, threadNumber },
    }),
  );
}
export async function resolveComment(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  assetId: string,
  versionId: string,
  id: string,
  resolved: boolean,
) {
  const { member } = await writable(
    tx,
    userId,
    workspaceId,
    projectId,
    assetId,
    versionId,
  );
  if (member.role === "CLIENT")
    throw new AccessError(
      "Only the owner or an assigned designer can resolve threads.",
    );
  if (!z.uuid().safeParse(id).success)
    throw new AccessError("Thread not found.", 404);
  const root = await tx.comment.findFirst({
    where: { id, versionId, parentId: null },
  });
  if (!root) throw new AccessError("Thread not found.", 404);
  if (!!root.resolvedAt === resolved) return commentView(root);
  return commentView(
    await tx.comment.update({
      where: { id: root.id },
      data: { resolvedAt: resolved ? new Date() : null },
    }),
  );
}
