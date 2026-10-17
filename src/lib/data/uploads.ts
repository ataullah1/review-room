import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { UserDatabase } from "./context";
import { requireProjectAccess, requireProjectRole } from "./permissions";
import { uploadInput, UploadError } from "../../features/uploads/validation";
import type { validateImage } from "../../features/uploads/image";
async function writable(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`project:${projectId}`}, 0))::text`;
  const { project } = await requireProjectRole(
    tx,
    userId,
    workspaceId,
    projectId,
    ["OWNER", "DESIGNER"],
  );
  if (project.archivedAt)
    throw new UploadError("Restore this project before uploading images.", 409);
}
export async function prepareUpload(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  input: unknown,
) {
  await writable(tx, userId, workspaceId, projectId);
  const file = uploadInput.parse(input);
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`upload:${userId}`}, 0))::text`;
  if (
    (await tx.assetVersion.count({
      where: {
        creatorId: userId,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    })) >= 5
  )
    throw new UploadError(
      "Finish or cancel your existing uploads before starting another.",
      429,
    );
  const assetId = randomUUID(),
    id = randomUUID(),
    extension =
      file.mimeType === "image/jpeg" ? "jpg" : file.mimeType.split("/")[1];
  await tx.asset.create({
    data: {
      id: assetId,
      workspaceId,
      projectId,
      title:
        file.name.replace(/\.[^.]+$/, "").slice(0, 150) || "Untitled image",
    },
  });
  return tx.assetVersion.create({
    data: {
      id,
      assetId,
      workspaceId,
      projectId,
      creatorId: userId,
      originalName: file.name,
      expectedMimeType: file.mimeType,
      expectedSize: file.size,
      stagingKey: `_pending/${workspaceId}/${projectId}/${id}/${randomUUID()}.${extension}`,
      objectKey: `${workspaceId}/${projectId}/${assetId}/${id}/original.${extension}`,
      expiresAt: new Date(Date.now() + 10 * 60_000),
      cleanupAfter: new Date(Date.now() + 125 * 60_000),
    },
  });
}
export async function findUpload(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  versionId: string,
) {
  await requireProjectAccess(tx, userId, workspaceId, projectId);
  if (!z.uuid().safeParse(versionId).success)
    throw new UploadError("Upload not found.", 404);
  const row = await tx.assetVersion.findFirst({
    where: { id: versionId, workspaceId, projectId, creatorId: userId },
  });
  if (!row) throw new UploadError("Upload not found.", 404);
  return row;
}
export async function claimUpload(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  versionId: string,
) {
  await writable(tx, userId, workspaceId, projectId);
  const row = await findUpload(tx, userId, workspaceId, projectId, versionId);
  if (row.status === "READY") return { row, token: null };
  if (row.status !== "PENDING" || row.expiresAt <= new Date())
    throw new UploadError(
      "This upload expired or was cancelled. Please upload it again.",
      409,
    );
  const token = randomUUID();
  const claimed = await tx.assetVersion.updateMany({
    where: { id: row.id, status: "PENDING", processingToken: null },
    data: {
      processingToken: token,
      processingUntil: new Date(Date.now() + 2 * 60_000),
    },
  });
  if (!claimed.count)
    throw new UploadError(
      "This upload is already being checked. Please try again shortly.",
      409,
    );
  return { row, token };
}
export async function publishUpload(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  versionId: string,
  token: string,
  metadata: Awaited<ReturnType<typeof validateImage>>,
) {
  await writable(tx, userId, workspaceId, projectId);
  const row = await findUpload(tx, userId, workspaceId, projectId, versionId);
  if (row.status === "READY") return row;
  const updated = await tx.assetVersion.updateMany({
    where: {
      id: row.id,
      status: "PENDING",
      processingToken: token,
      processingUntil: { gt: new Date() },
      expiresAt: { gt: new Date() },
    },
    data: {
      ...metadata,
      status: "READY",
      processingToken: null,
      processingUntil: null,
    },
  });
  if (!updated.count)
    throw new UploadError(
      "This upload was cancelled or expired. Please upload it again.",
      409,
    );
  await tx.asset.update({
    where: { id: row.assetId },
    data: { currentVersionId: row.id },
  });
  return { ...row, ...metadata, status: "READY" as const };
}
export async function failUpload(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  versionId: string,
  reason: string,
  token?: string,
) {
  const row = await findUpload(tx, userId, workspaceId, projectId, versionId);
  await tx.assetVersion.updateMany({
    where: {
      id: row.id,
      status: "PENDING",
      ...(token ? { processingToken: token } : {}),
    },
    data: { status: "FAILED", failureReason: reason.slice(0, 200) },
  });
  return tx.assetVersion.findUniqueOrThrow({ where: { id: row.id } });
}
export async function readyAsset(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  assetId: string,
) {
  await requireProjectAccess(tx, userId, workspaceId, projectId);
  if (!z.uuid().safeParse(assetId).success)
    throw new UploadError("Image not found.", 404);
  const asset = await tx.asset.findFirst({
    where: { id: assetId, workspaceId, projectId },
    include: { currentVersion: true },
  });
  if (!asset?.currentVersion || asset.currentVersion.status !== "READY")
    throw new UploadError("Image not found.", 404);
  return asset;
}
export async function listAssets(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  page = 1,
) {
  await requireProjectAccess(tx, userId, workspaceId, projectId);
  const where = {
    workspaceId,
    projectId,
    currentVersion: { is: { status: "READY" as const } },
  };
  const total = await tx.asset.count({ where });
  const pages = Math.max(1, Math.ceil(total / 12)),
    currentPage = Math.max(1, Math.min(pages, page));
  const assets = await tx.asset.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * 12,
    take: 12,
    select: {
      id: true,
      title: true,
      createdAt: true,
      currentVersion: {
        select: {
          id: true,
          width: true,
          height: true,
          fileSize: true,
          mimeType: true,
          versionNumber: true,
        },
      },
    },
  });
  return { assets, total, pages, page: currentPage };
}
