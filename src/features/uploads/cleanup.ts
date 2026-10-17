import type { PrismaClient, Prisma } from "../../generated/prisma/client";
import type { UploadStorage } from "../../lib/storage/client";
// Bounded maintenance path. No object key is accepted from an HTTP request.
export async function cleanupUploads(
  db: PrismaClient,
  storage: UploadStorage,
  limit = 25,
  now = new Date(),
) {
  const system = <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) =>
    db.$transaction(async (tx) => {
      // Like request-scoped operations, maintenance cannot inherit the pool's
      // default time zone when Prisma binds expiry timestamps.
      await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
      return operation(tx);
    });
  const rows = await system(async (tx) => {
    await tx.assetVersion.updateMany({
      where: {
        status: "PENDING",
        expiresAt: { lt: now },
        OR: [{ processingUntil: null }, { processingUntil: { lt: now } }],
      },
      data: {
        status: "FAILED",
        failureReason: "Upload expired before completion.",
      },
    });
    return tx.assetVersion.findMany({
      where: {
        cleanupAfter: { lt: now },
        cleanedAt: null,
        status: { in: ["READY", "FAILED"] },
      },
      orderBy: { cleanupAfter: "asc" },
      take: Math.min(100, Math.max(1, limit)),
    });
  });
  let cleaned = 0;
  for (const row of rows) {
    try {
      // READY is immutable. Its final object is deliberately excluded.
      await storage.remove(
        row.status === "READY"
          ? [row.stagingKey]
          : [row.stagingKey, row.objectKey],
      );
      await system((tx) =>
        tx.assetVersion.update({
          where: { id: row.id },
          data: { cleanedAt: now },
        }),
      );
      cleaned++;
    } catch {
      /* Durable row remains queued for the next cleanup run. */
    }
  }
  return { examined: rows.length, cleaned };
}
