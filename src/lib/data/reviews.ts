import type { ReviewDecision } from "../../generated/prisma/client";
import type { UserDatabase } from "./context";
import type { DecisionPage, VersionPage } from "../../features/reviews/types";
import { decisionInput } from "../../features/reviews/validation";
import { reviewVersion } from "./comments";
import { AccessError } from "../auth/errors";
export const decisionView = (row: ReviewDecision) => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
});
export async function versionPage(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  assetId: string,
  before?: number,
): Promise<VersionPage> {
  await reviewVersion(tx, userId, workspaceId, projectId, assetId);
  const rows = await tx.assetVersion.findMany({
    where: {
      assetId,
      workspaceId,
      projectId,
      status: "READY",
      ...(before ? { versionNumber: { lt: before } } : {}),
    },
    orderBy: { versionNumber: "desc" },
    take: 21,
    select: {
      id: true,
      versionNumber: true,
      createdAt: true,
      creatorName: true,
    },
  });
  return {
    versions: rows.slice(0, 20).map((r) => ({
      id: r.id,
      versionNumber: r.versionNumber,
      createdAt: r.createdAt.toISOString(),
      uploader: r.creatorName,
    })),
    next: rows.length > 20 ? rows[19].versionNumber : null,
  };
}
export async function decisionPage(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  assetId: string,
  versionId: string,
  before?: number,
): Promise<DecisionPage> {
  await reviewVersion(tx, userId, workspaceId, projectId, assetId, versionId);
  const rows = await tx.reviewDecision.findMany({
    where: { versionId, ...(before ? { decisionNumber: { lt: before } } : {}) },
    orderBy: { decisionNumber: "desc" },
    take: 21,
  });
  const latest = await tx.$queryRaw<
    ReviewDecision[]
  >`SELECT DISTINCT ON ("reviewerId") * FROM app."ReviewDecision" WHERE "versionId"=${versionId}::uuid ORDER BY "reviewerId", "decisionNumber" DESC`;
  return {
    history: rows.slice(0, 20).map(decisionView),
    latest: latest.map(decisionView),
    next: rows.length > 20 ? rows[19].decisionNumber : null,
  };
}
export async function submitDecision(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  assetId: string,
  input: unknown,
) {
  const data = decisionInput.parse(input);
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`project:${projectId}`},0))::text`;
  const { asset, project, member } = await reviewVersion(
    tx,
    userId,
    workspaceId,
    projectId,
    assetId,
    data.expectedCurrentVersionId,
  );
  if (member.role !== "CLIENT")
    throw new AccessError("Only assigned clients can make review decisions.");
  // Replay a committed submission as historical data, even after a later publication.
  const prior = await tx.reviewDecision.findUnique({ where: { id: data.id } });
  if (prior) {
    if (
      prior.reviewerId !== userId ||
      prior.versionId !== data.expectedCurrentVersionId ||
      prior.decision !== data.decision ||
      prior.note !== data.note
    )
      throw new AccessError(
        "This submission was already used. Start a new decision.",
        409,
      );
    return decisionView(prior);
  }
  if (project.archivedAt)
    throw new AccessError("Restore this project before reviewing.", 409);
  if (asset.currentVersionId !== data.expectedCurrentVersionId)
    throw new AccessError(
      "A newer version is available. Refresh and review the current version.",
      409,
    );
  return decisionView(
    await tx.reviewDecision.create({
      data: {
        id: data.id,
        versionId: data.expectedCurrentVersionId,
        reviewerId: userId,
        decision: data.decision,
        note: data.note,
      },
    }),
  );
}
