import type { PrismaClient } from "../../generated/prisma/client";
import { withUserDatabase } from "../../lib/data/context";
import {
  prepareUpload,
  claimUpload,
  publishUpload,
  failUpload,
  findUpload,
} from "../../lib/data/uploads";
import type { UploadStorage } from "../../lib/storage/client";
import { validateImage } from "./image";
import { UploadError } from "./validation";
export function uploadService(
  db: PrismaClient,
  storage: UploadStorage,
  userId: string,
  workspaceId: string,
  projectId: string,
) {
  const scoped = <T>(op: Parameters<typeof withUserDatabase<T>>[2]) =>
    withUserDatabase(db, userId, op);
  const fail = async (versionId: string, reason: string, token?: string) => {
    const row = await scoped((tx) =>
      failUpload(tx, userId, workspaceId, projectId, versionId, reason, token),
    );
    // Never delete a READY object after an ambiguous/late database commit.
    if (row.status === "FAILED")
      await storage
        .remove([row.stagingKey, row.objectKey])
        .catch(() => undefined);
    return row;
  };
  return {
    async prepare(input: unknown) {
      const row = await scoped((tx) =>
        prepareUpload(tx, userId, workspaceId, projectId, input),
      );
      try {
        return {
          versionId: row.id,
          assetId: row.assetId,
          uploadUrl: await storage.signUpload(row.stagingKey),
          expiresAt: row.expiresAt.toISOString(),
        };
      } catch (error) {
        await fail(row.id, "Could not start upload.").catch(() => undefined);
        throw error;
      }
    },
    async finalize(versionId: string) {
      const { row, token } = await scoped((tx) =>
        claimUpload(tx, userId, workspaceId, projectId, versionId),
      );
      if (!token) return { assetId: row.assetId, versionId: row.id };
      try {
        const bytes = await storage.read(row.stagingKey);
        const metadata = await validateImage(bytes, {
          name: row.originalName,
          mimeType: row.expectedMimeType,
          size: row.expectedSize,
        });
        await storage.put(row.objectKey, bytes, metadata.mimeType);
        const published = await scoped((tx) =>
          publishUpload(
            tx,
            userId,
            workspaceId,
            projectId,
            versionId,
            token,
            metadata,
          ),
        );
        await storage.remove([row.stagingKey]).catch(() => undefined);
        return { assetId: published.assetId, versionId: published.id };
      } catch (error) {
        const state = await fail(
          versionId,
          error instanceof UploadError
            ? error.message
            : "Upload could not be completed.",
          token,
        ).catch(() => null);
        if (state?.status === "READY")
          return { assetId: state.assetId, versionId: state.id };
        throw error;
      }
    },
    async cancel(versionId: string) {
      await scoped((tx) =>
        findUpload(tx, userId, workspaceId, projectId, versionId),
      );
      const row = await fail(versionId, "Upload cancelled.");
      return { cancelled: row.status !== "READY", assetId: row.assetId };
    },
  };
}
