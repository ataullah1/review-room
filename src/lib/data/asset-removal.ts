import { z } from "zod";
import type { UserDatabase } from "./context";
import { requireProjectRole } from "./permissions";
import { capabilityResult } from "./sharing";
export type RemovalImpact = {
  title: string;
  versions: number;
  bytes: number;
  comments: number;
  links: number;
  retainedDeliveries: number;
};
export type RemovedAsset = {
  id: string;
  assetId: string;
  title: string;
  reason: string;
  actorName: string;
  removedAt: string;
  restoreUntil: string;
};
export async function removalDetails(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  assetId?: string,
) {
  await requireProjectRole(tx, userId, workspaceId, projectId, ["OWNER"]);
  if (
    await tx.reviewerDemoAccount.findUnique({
      where: { userId },
      select: { userId: true },
    })
  )
    return null;
  if (assetId) {
    z.uuid().parse(assetId);
    if (
      !(await tx.asset.findFirst({
        where: { id: assetId, projectId, workspaceId },
      }))
    )
      return null;
    const rows = await tx.$queryRaw<
      { value: RemovalImpact }[]
    >`SELECT app.asset_removal_impact(${assetId}::uuid) AS value`;
    return {
      impact: capabilityResult(rows[0].value),
      removed: [] as RemovedAsset[],
    };
  }
  const rows = await tx.$queryRaw<
    { value: RemovedAsset[] }[]
  >`SELECT app.removed_project_assets(${projectId}::uuid) AS value`;
  return { impact: null, removed: capabilityResult(rows[0].value) };
}
export async function changeAssetRemoval(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  input: unknown,
) {
  await requireProjectRole(tx, userId, workspaceId, projectId, ["OWNER"]);
  const data = z
    .object({
      assetId: z.uuid(),
      restoring: z.boolean(),
      reason: z.string().trim().max(500),
    })
    .parse(input);
  // A removed asset is intentionally hidden by RLS. The narrow function checks its owner;
  // verify the supplied project separately through the function's scoped argument.
  const rows = await tx.$queryRaw<
    { value: { removed?: boolean; restored?: boolean } }[]
  >`SELECT app.change_asset_removal(${data.assetId}::uuid,${data.restoring},${data.reason},${projectId}::uuid) AS value`;
  return capabilityResult(rows[0].value);
}
