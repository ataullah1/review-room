import { z } from "zod";
import type { UserDatabase } from "./context";
import { requireProjectRole, requireProjectAccess } from "./permissions";
import { capabilityResult } from "./sharing";
import type { RoundStatus } from "./review-rounds";
export type DeliveryFile = {
  assetId: string;
  title: string;
  versionId: string;
  versionNumber: number;
  contentHash: string;
  fileSize: number;
  mimeType: string;
  originalName: string;
  width: number;
  height: number;
  review: RoundStatus;
};
export type DeliveryManifest = {
  formatVersion: 1;
  projectName: string;
  files: DeliveryFile[];
};
export async function changeCompletion(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  input: unknown,
) {
  await requireProjectRole(tx, userId, workspaceId, projectId, ["OWNER"]);
  const data = z
    .object({
      id: z.uuid(),
      operation: z.enum(["complete", "reopen"]),
      reason: z.string().trim().max(500).optional(),
    })
    .parse(input);
  const rows =
    data.operation === "complete"
      ? await tx.$queryRaw<
          { value: { id: string } }[]
        >`SELECT app.complete_project(${projectId}::uuid,${data.id}::uuid) AS value`
      : await tx.$queryRaw<
          { value: { reopened: boolean } }[]
        >`SELECT app.reopen_project(${projectId}::uuid,${data.id}::uuid,${data.reason || ""}) AS value`;
  return capabilityResult(rows[0].value);
}
export async function deliverySnapshot(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  completionId?: string,
) {
  const { project } = await requireProjectAccess(
    tx,
    userId,
    workspaceId,
    projectId,
  );
  if (completionId) z.uuid().parse(completionId);
  const records = await tx.projectCompletion.findMany({
    where: { workspaceId, projectId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const snapshot = completionId
    ? await tx.projectCompletion.findFirst({
        where: { id: completionId, workspaceId, projectId },
      })
    : records.find((r) => r.id === project.completionId) || records[0];
  return {
    project,
    snapshot: snapshot
      ? {
          ...snapshot,
          manifest: snapshot.manifest as unknown as DeliveryManifest,
        }
      : null,
    history: records.map((r) => ({ id: r.id, createdAt: r.createdAt })),
  };
}
