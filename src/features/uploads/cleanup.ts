import { randomUUID } from "node:crypto";
import type { PrismaClient, Prisma } from "../../generated/prisma/client";
import type { UploadStorage } from "../../lib/storage/client";

export type CleanupOptions = {
  limit?: number;
  now?: Date;
  leaseMs?: number;
  backoffMs?: number;
  maxDrainBudgetMs?: number;
  dryRun?: boolean;
};

export type CleanupBacklogMetrics = {
  pendingExpired: number;
  readyStaging: number;
  failedFinal: number;
  totalQueue: number;
  oldestAgeSeconds: number | null;
};

export type CleanupResult = {
  examined: number;
  cleaned: number;
  failed: number;
  leased: number;
  backlog: CleanupBacklogMetrics;
};

// Bounded maintenance path. No object key is accepted from an HTTP request.
export async function cleanupUploads(
  db: PrismaClient,
  storage: UploadStorage,
  optionsOrLimit: number | CleanupOptions = 25,
  nowParam?: Date,
): Promise<CleanupResult> {
  const options: CleanupOptions =
    typeof optionsOrLimit === "number"
      ? { limit: optionsOrLimit, now: nowParam }
      : optionsOrLimit;

  const limit = Math.min(100, Math.max(1, options.limit ?? 25));
  const baseNow = options.now ?? new Date();
  const leaseMs = Math.max(5000, options.leaseMs ?? 60_000);
  const backoffMs = Math.max(10_000, options.backoffMs ?? 300_000);
  const dryRun = options.dryRun ?? false;
  const budgetMs = options.maxDrainBudgetMs ?? 0;
  const startTime = Date.now();

  const system = <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) =>
    db.$transaction(async (tx) => {
      // Like request-scoped operations, maintenance cannot inherit the pool's
      // default time zone when Prisma binds expiry timestamps.
      await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
      return operation(tx);
    });

  let totalExamined = 0;
  let totalCleaned = 0;
  let totalFailed = 0;

  do {
    const currentNow = new Date();
    const effectiveNow = options.now ? baseNow : currentNow;

    // 1. Bounded PENDING expiration
    if (!dryRun) {
      await system(async (tx) => {
        const expiredPending = await tx.assetVersion.findMany({
          where: {
            status: "PENDING",
            expiresAt: { lt: effectiveNow },
            OR: [
              { processingUntil: null },
              { processingUntil: { lt: effectiveNow } },
            ],
          },
          select: { id: true },
          take: limit * 2,
        });

        if (expiredPending.length > 0) {
          await tx.assetVersion.updateMany({
            where: {
              id: { in: expiredPending.map((p) => p.id) },
              status: "PENDING",
            },
            data: {
              status: "FAILED",
              failureReason: "Upload expired before completion.",
            },
          });
        }
      });
    }

    if (dryRun) {
      break;
    }

    // 2. Safe concurrent worker lease
    const workerToken = randomUUID();
    const leaseUntil = new Date(effectiveNow.getTime() + leaseMs);

    const leasedRows = await system(async (tx) => {
      const candidates = await tx.assetVersion.findMany({
        where: {
          cleanupAfter: { lte: effectiveNow },
          cleanedAt: null,
          AND: [
            {
              OR: [
                { cleanupRetryAt: null },
                { cleanupRetryAt: { lte: effectiveNow } },
              ],
            },
          ],
          status: { in: ["READY", "FAILED"] },
          OR: [{ cleanupUntil: null }, { cleanupUntil: { lt: effectiveNow } }],
        },
        orderBy: { cleanupAfter: "asc" },
        take: limit,
        select: { id: true },
      });

      if (!candidates.length) return [];

      const candidateIds = candidates.map((c) => c.id);

      await tx.assetVersion.updateMany({
        where: {
          id: { in: candidateIds },
          cleanedAt: null,
          status: { in: ["READY", "FAILED"] },
          OR: [{ cleanupUntil: null }, { cleanupUntil: { lt: effectiveNow } }],
        },
        data: {
          cleanupToken: workerToken,
          cleanupUntil: leaseUntil,
        },
      });

      return tx.assetVersion.findMany({
        where: {
          cleanupToken: workerToken,
          cleanedAt: null,
        },
        orderBy: { cleanupAfter: "asc" },
      });
    });

    totalExamined += leasedRows.length;

    // 3. Process claimed rows
    for (const row of leasedRows) {
      try {
        // READY is immutable. Its final object is deliberately excluded.
        await storage.remove(
          row.status === "READY"
            ? [row.stagingKey]
            : [row.stagingKey, row.objectKey],
        );
        await system((tx) =>
          tx.assetVersion.update({
            where: { id: row.id, cleanupToken: workerToken },
            data: {
              cleanedAt: effectiveNow,
              cleanupRetryAt: null,
              cleanupToken: null,
              cleanupUntil: null,
            },
          }),
        );
        totalCleaned++;
      } catch {
        totalFailed++;
        // Apply retry backoff and release the lease so other queued rows can be processed
        await system((tx) =>
          tx.assetVersion.update({
            where: { id: row.id, cleanupToken: workerToken },
            data: {
              cleanupRetryAt: new Date(effectiveNow.getTime() + backoffMs),
              cleanupToken: null,
              cleanupUntil: null,
            },
          }),
        ).catch(() => undefined);
      }
    }

    if (leasedRows.length < limit) {
      // Drained current available backlog
      break;
    }

    if (budgetMs > 0 && Date.now() - startTime >= budgetMs) {
      break;
    }
  } while (budgetMs > 0 && Date.now() - startTime < budgetMs);

  // 4. Compute index-backed backlog metrics
  const metricsNow = options.now ? baseNow : new Date();
  const backlog = await system(async (tx) => {
    const [pendingExpired, readyStaging, failedFinal, oldestRow, activeLeased] =
      await Promise.all([
        tx.assetVersion.count({
          where: {
            status: "PENDING",
            expiresAt: { lt: metricsNow },
            OR: [
              { processingUntil: null },
              { processingUntil: { lt: metricsNow } },
            ],
          },
        }),
        tx.assetVersion.count({
          where: {
            status: "READY",
            cleanupAfter: { lte: metricsNow },
            cleanedAt: null,
          },
        }),
        tx.assetVersion.count({
          where: {
            status: "FAILED",
            cleanupAfter: { lte: metricsNow },
            cleanedAt: null,
          },
        }),
        tx.assetVersion.findFirst({
          where: {
            cleanedAt: null,
            status: { in: ["READY", "FAILED"] },
          },
          orderBy: { cleanupAfter: "asc" },
          select: { cleanupAfter: true },
        }),
        tx.assetVersion.count({
          where: {
            cleanedAt: null,
            status: { in: ["READY", "FAILED"] },
            cleanupUntil: { gt: metricsNow },
          },
        }),
      ]);

    const totalQueue = readyStaging + failedFinal;
    const oldestAgeSeconds = oldestRow
      ? Math.max(
          0,
          Math.floor(
            (metricsNow.getTime() - oldestRow.cleanupAfter.getTime()) / 1000,
          ),
        )
      : null;

    return {
      pendingExpired,
      readyStaging,
      failedFinal,
      totalQueue,
      oldestAgeSeconds,
      activeLeased,
    };
  });

  return {
    examined: totalExamined,
    cleaned: totalCleaned,
    failed: totalFailed,
    leased: backlog.activeLeased,
    backlog: {
      pendingExpired: backlog.pendingExpired,
      readyStaging: backlog.readyStaging,
      failedFinal: backlog.failedFinal,
      totalQueue: backlog.totalQueue,
      oldestAgeSeconds: backlog.oldestAgeSeconds,
    },
  };
}
