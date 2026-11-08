import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  PrismaClient,
  DeliveryPackage,
} from "../../generated/prisma/client";
import { withUserDatabase } from "../../lib/data/context";
import { deliverySnapshot } from "../../lib/data/completion";
import { getUploadStorage } from "../../lib/server/uploads";
import { packagesEnabled, packageStorage } from "./storage";
import {
  packageEntryName,
  packageMaxBytes,
  packageMaxFiles,
  writeDeliveryZip,
} from "./zip";
export const packageKey = (id: string) => `deliveries/${id}.zip`;
export async function maintainPackages(
  db: PrismaClient,
  generate = true,
  dependencies?: {
    enabled: boolean;
    storage: ReturnType<typeof packageStorage>;
    originals: Pick<ReturnType<typeof getUploadStorage>, "read">;
  },
) {
  if (!(dependencies?.enabled ?? packagesEnabled())) generate = false;
  if (
    !generate &&
    !(await db.deliveryPackage.findFirst({
      where: { cleanedAt: null },
      select: { id: true },
    }))
  )
    return { generated: 0, cleaned: 0, failed: 0 };
  // Individual request retries dispatch generation; cron only expires/cleans artifacts.
  const storage = dependencies?.storage || packageStorage();
  const bucketLimit = await storage.verify();
  const now = new Date();
  let cleaned = 0,
    failed = 0;
  // Retain the row/key until object deletion succeeds. Expiry never deletes originals.
  await db.deliveryPackage.updateMany({
    where: {
      status: "PROCESSING",
      attempts: { gte: 3 },
      leaseUntil: { lte: now },
    },
    data: { status: "FAILED", leaseToken: null, leaseUntil: null },
  });
  const cleanupToken = randomUUID();
  const stale = await db.$queryRaw<
    DeliveryPackage[]
  >`UPDATE app."DeliveryPackage" SET "leaseToken"=${cleanupToken}::uuid,"leaseUntil"=now()+interval '2 minutes' WHERE id IN (SELECT id FROM app."DeliveryPackage" WHERE "cleanedAt" IS NULL AND ("expiresAt"<=now() OR status IN ('FAILED','CANCELLED')) AND ("leaseUntil" IS NULL OR "leaseUntil"<=now()) ORDER BY "expiresAt" FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`;
  for (const row of stale) {
    try {
      await storage.remove(packageKey(row.id));
      await db.deliveryPackage.updateMany({
        where: { id: row.id, leaseToken: cleanupToken },
        data: {
          cleanedAt: new Date(),
          status: row.expiresAt <= now ? "EXPIRED" : row.status,
          leaseToken: null,
          leaseUntil: null,
        },
      });
      cleaned++;
    } catch {
      await db.deliveryPackage.updateMany({
        where: { id: row.id, leaseToken: cleanupToken },
        data: { leaseToken: null, leaseUntil: new Date(Date.now() + 60_000) },
      });
      failed++;
    }
  }
  if (!generate) return { generated: 0, cleaned, failed };
  const token = randomUUID();
  const rows = await db.$queryRaw<
    DeliveryPackage[]
  >`UPDATE app."DeliveryPackage" SET status='PROCESSING',attempts=attempts+1,"leaseToken"=${token}::uuid,"leaseUntil"=now()+interval '2 minutes',"updatedAt"=now() WHERE id=(SELECT id FROM app."DeliveryPackage" WHERE "expiresAt">now() AND attempts<3 AND (status='QUEUED' OR (status='PROCESSING' AND "leaseUntil"<now())) ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`;
  const job = rows[0];
  if (!job) return { generated: 0, cleaned, failed };
  let directory: string | undefined;
  try {
    const sources = await withUserDatabase(
      db,
      job.requestedById,
      async (tx) => {
        const data = await deliverySnapshot(
          tx,
          job.requestedById,
          job.workspaceId,
          job.projectId,
          job.completionId,
        );
        if (!data.snapshot) throw new Error("Delivery no longer available.");
        const files = data.snapshot.manifest.files;
        if (
          !files.length ||
          files.length > packageMaxFiles ||
          files.reduce((n, f) => n + f.fileSize, 0) >
            Math.min(packageMaxBytes, bucketLimit - files.length * 1024 - 1024)
        )
          throw new Error("Package limit exceeded.");
        return Promise.all(
          files.map(async (f, index) => {
            const row = await tx.assetVersion.findFirst({
              where: {
                id: f.versionId,
                projectId: job.projectId,
                workspaceId: job.workspaceId,
                status: "READY",
                contentHash: f.contentHash,
                fileSize: f.fileSize,
              },
            });
            if (!row) throw new Error("Approved source unavailable.");
            return {
              key: row.objectKey,
              hash: f.contentHash,
              size: f.fileSize,
              name: packageEntryName(index, f.originalName),
            };
          }),
        );
      },
    );
    directory = await mkdtemp(join(tmpdir(), "review-room-zip-"));
    const path = join(directory, "delivery.zip"),
      deadline = Date.now() + 25_000;
    async function* originals() {
      for (const source of sources) {
        if (Date.now() > deadline - 20_000)
          throw new Error("Package generation budget exceeded.");
        const bytes = await (
          dependencies?.originals || getUploadStorage()
        ).read(source.key);
        if (
          bytes.length !== source.size ||
          createHash("sha256").update(bytes).digest("hex") !== source.hash
        )
          throw new Error("Original integrity mismatch.");
        yield { name: source.name, bytes };
      }
    }
    const archive = await writeDeliveryZip(path, originals());
    if (Date.now() > deadline)
      throw new Error("Package generation budget exceeded.");
    if (
      !(await db.deliveryPackage.findFirst({
        where: {
          id: job.id,
          leaseToken: token,
          status: "PROCESSING",
          leaseUntil: { gt: new Date() },
          expiresAt: { gt: new Date() },
        },
      }))
    )
      throw new Error("Package cancelled or lease expired.");
    await withUserDatabase(db, job.requestedById, (tx) =>
      deliverySnapshot(
        tx,
        job.requestedById,
        job.workspaceId,
        job.projectId,
        job.completionId,
      ),
    );
    await storage.put(packageKey(job.id), path);
    const saved = await db.deliveryPackage.updateMany({
      where: {
        id: job.id,
        leaseToken: token,
        status: "PROCESSING",
        leaseUntil: { gt: new Date() },
        expiresAt: { gt: new Date() },
      },
      data: {
        status: "READY",
        artifactBytes: archive.bytes,
        artifactHash: archive.hash,
        leaseToken: null,
        leaseUntil: null,
        updatedAt: new Date(),
      },
    });
    return { generated: saved.count, cleaned, failed };
  } catch {
    await db.deliveryPackage.updateMany({
      where: { id: job.id, leaseToken: token, status: "PROCESSING" },
      data: {
        status: "FAILED",
        leaseToken: null,
        leaseUntil: null,
        updatedAt: new Date(),
      },
    });
    return { generated: 0, cleaned, failed: failed + 1 };
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}
