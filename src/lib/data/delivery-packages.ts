import { z } from "zod";
import type { UserDatabase } from "./context";
import { deliverySnapshot } from "./completion";
import { capabilityResult } from "./sharing";
import { AccessError } from "../auth/errors";
export async function packageStatus(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  completionId: string,
) {
  z.uuid().parse(completionId);
  const data = await deliverySnapshot(
    tx,
    userId,
    workspaceId,
    projectId,
    completionId,
  );
  if (!data.snapshot) throw new AccessError("Delivery not found.", 404);
  const job = await tx.deliveryPackage.findFirst({
    where: { completionId, projectId, workspaceId, requestedById: userId },
  });
  return job
    ? {
        id: job.id,
        status: job.expiresAt <= new Date() ? "EXPIRED" : job.status,
        expiresAt: job.expiresAt.toISOString(),
        artifactBytes: job.artifactBytes,
        artifactHash: job.artifactHash,
      }
    : null;
}
export async function requestPackage(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  completionId: string,
  cancelling = false,
) {
  await packageStatus(tx, userId, workspaceId, projectId, completionId);
  const rows = await tx.$queryRaw<
    { value: { id?: string; cancelled?: boolean } }[]
  >`SELECT app.request_delivery_package(${completionId}::uuid,${cancelling}) AS value`;
  return capabilityResult(rows[0].value);
}
