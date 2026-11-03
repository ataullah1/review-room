import type { PrismaClient } from "../../generated/prisma/client";
import type { UserDatabase } from "./context";
import { requireWorkspaceMember } from "./permissions";
import { readStorageLimits, type StorageLimits } from "../config/limits";
import { UploadError } from "../../features/uploads/validation";

export type WorkspaceStorageUsage = {
  committedBytes: number;
  reservedBytes: number;
  totalAccountedBytes: number;
  readyVersionsCount: number;
  pendingUploadsCount: number;
  maxStorageBytes: number;
  maxReadyVersions: number;
  maxPendingUploads: number;
  usagePercentage: number;
  isOverLimit: boolean;
};

export type StorageReconciliationReport = {
  workspaceId: string;
  workspaceName: string;
  committedBytes: number;
  reservedBytes: number;
  stalePendingBytes: number;
  totalAccountedBytes: number;
  readyVersionsCount: number;
  activePendingCount: number;
  expiredPendingCount: number;
  failedVersionsCount: number;
  maxStorageBytes: number;
  isOverLimit: boolean;
};

export async function getWorkspaceStorageUsage(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  limits: StorageLimits = readStorageLimits(),
  now: Date = new Date(),
): Promise<WorkspaceStorageUsage> {
  await requireWorkspaceMember(tx, userId, workspaceId);

  const [readyAggregate, pendingAggregate] = await Promise.all([
    tx.assetVersion.aggregate({
      where: {
        workspaceId,
        status: "READY",
      },
      _sum: {
        fileSize: true,
      },
      _count: {
        id: true,
      },
    }),
    tx.assetVersion.aggregate({
      where: {
        workspaceId,
        status: "PENDING",
        expiresAt: { gt: now },
      },
      _sum: {
        expectedSize: true,
      },
      _count: {
        id: true,
      },
    }),
  ]);

  const committedBytes = Number(readyAggregate._sum.fileSize ?? 0);
  const reservedBytes = Number(pendingAggregate._sum.expectedSize ?? 0);
  const totalAccountedBytes = committedBytes + reservedBytes;
  const readyVersionsCount = readyAggregate._count.id;
  const pendingUploadsCount = pendingAggregate._count.id;

  const usagePercentage = Math.min(
    100,
    Math.round((totalAccountedBytes / limits.maxStorageBytes) * 100),
  );
  const isOverLimit =
    totalAccountedBytes >= limits.maxStorageBytes ||
    readyVersionsCount >= limits.maxReadyVersions;

  return {
    committedBytes,
    reservedBytes,
    totalAccountedBytes,
    readyVersionsCount,
    pendingUploadsCount,
    maxStorageBytes: limits.maxStorageBytes,
    maxReadyVersions: limits.maxReadyVersions,
    maxPendingUploads: limits.maxPendingUploads,
    usagePercentage,
    isOverLimit,
  };
}

export async function assertStorageAvailable(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  expectedNewBytes: number,
  limits: StorageLimits = readStorageLimits(),
  now: Date = new Date(),
): Promise<WorkspaceStorageUsage> {
  // Advisory lock per workspace serializes concurrent reservations
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`storage:${workspaceId}`}, 0))::text`;

  const usage = await getWorkspaceStorageUsage(
    tx,
    userId,
    workspaceId,
    limits,
    now,
  );

  if (usage.totalAccountedBytes + expectedNewBytes > usage.maxStorageBytes) {
    const usedMb = (usage.totalAccountedBytes / (1024 * 1024)).toFixed(1);
    const limitMb = (usage.maxStorageBytes / (1024 * 1024)).toFixed(0);
    throw new UploadError(
      `Workspace storage limit reached (${usedMb} MB of ${limitMb} MB used). Clean up unneeded images before uploading new files.`,
      429,
    );
  }

  if (usage.readyVersionsCount + 1 > usage.maxReadyVersions) {
    throw new UploadError(
      `Workspace version limit reached (${usage.readyVersionsCount} of ${usage.maxReadyVersions} versions). Delete unneeded images before uploading new files.`,
      429,
    );
  }

  if (usage.pendingUploadsCount >= usage.maxPendingUploads) {
    throw new UploadError(
      "Finish or cancel existing pending uploads in this workspace before starting another.",
      429,
    );
  }

  return usage;
}

export async function reconcileWorkspaceStorage(
  db: PrismaClient,
  targetWorkspaceId?: string,
  limits: StorageLimits = readStorageLimits(),
  now: Date = new Date(),
): Promise<StorageReconciliationReport[]> {
  const workspaces = await db.workspace.findMany({
    where: targetWorkspaceId ? { id: targetWorkspaceId } : undefined,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const reports: StorageReconciliationReport[] = [];

  for (const ws of workspaces) {
    const [readyAgg, activePendingAgg, stalePendingAgg, failedCount] =
      await Promise.all([
        db.assetVersion.aggregate({
          where: { workspaceId: ws.id, status: "READY" },
          _sum: { fileSize: true },
          _count: { id: true },
        }),
        db.assetVersion.aggregate({
          where: {
            workspaceId: ws.id,
            status: "PENDING",
            expiresAt: { gt: now },
          },
          _sum: { expectedSize: true },
          _count: { id: true },
        }),
        db.assetVersion.aggregate({
          where: {
            workspaceId: ws.id,
            status: "PENDING",
            expiresAt: { lte: now },
          },
          _sum: { expectedSize: true },
          _count: { id: true },
        }),
        db.assetVersion.count({
          where: { workspaceId: ws.id, status: "FAILED" },
        }),
      ]);

    const committedBytes = Number(readyAgg._sum.fileSize ?? 0);
    const reservedBytes = Number(activePendingAgg._sum.expectedSize ?? 0);
    const stalePendingBytes = Number(stalePendingAgg._sum.expectedSize ?? 0);
    const totalAccountedBytes = committedBytes + reservedBytes;
    const readyVersionsCount = readyAgg._count.id;
    const activePendingCount = activePendingAgg._count.id;
    const expiredPendingCount = stalePendingAgg._count.id;

    reports.push({
      workspaceId: ws.id,
      workspaceName: ws.name,
      committedBytes,
      reservedBytes,
      stalePendingBytes,
      totalAccountedBytes,
      readyVersionsCount,
      activePendingCount,
      expiredPendingCount,
      failedVersionsCount: failedCount,
      maxStorageBytes: limits.maxStorageBytes,
      isOverLimit:
        totalAccountedBytes >= limits.maxStorageBytes ||
        readyVersionsCount >= limits.maxReadyVersions,
    });
  }

  return reports;
}
