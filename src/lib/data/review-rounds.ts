import { enqueueMail } from "../../features/notifications/enqueue";
import { z } from "zod";
import type { UserDatabase } from "./context";
import { capabilityResult } from "./sharing";
import { reviewVersion } from "./comments";
export type RoundStatus = {
  state:
    | "UNCONFIGURED"
    | "REVIEWERS_REQUIRED"
    | "CHANGES_REQUESTED"
    | "AWAITING_REVIEW"
    | "FEEDBACK_OPEN"
    | "APPROVED";
  roundId: string | null;
  requestedAt?: string;
  openComments: number;
  reviewers: {
    userId: string;
    name: string;
    hasAccess: boolean;
    decision: "APPROVED" | "CHANGES_REQUESTED" | null;
    decidedAt?: string | null;
    note?: string | null;
  }[];
};
export async function reviewRoundStatus(tx: UserDatabase, versionId: string) {
  z.uuid().parse(versionId);
  const rows = await tx.$queryRaw<
    { value: RoundStatus }[]
  >`SELECT app.review_round_status(${versionId}::uuid) AS value`;
  return capabilityResult(rows[0].value);
}
const requestSchema = z.object({
  id: z.uuid(),
  reviewerIds: z.array(z.uuid()).min(1).max(100),
  reason: z.string().trim().min(1).max(500),
  versionId: z.uuid(),
});
export async function requestReview(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  assetId: string,
  input: unknown,
) {
  const data = requestSchema.parse(input);
  await reviewVersion(
    tx,
    userId,
    workspaceId,
    projectId,
    assetId,
    data.versionId,
  );
  const rows = await tx.$queryRaw<
    { value: { id: string } }[]
  >`SELECT app.request_review(${data.versionId}::uuid,${data.id}::uuid,${data.reviewerIds}::uuid[],${data.reason}) AS value`;
  const result = capabilityResult(rows[0].value);
  for (const recipientId of data.reviewerIds)
    if (recipientId !== userId)
      await enqueueMail(tx, {
        workspaceId,
        projectId,
        kind: "REVIEW_READY",
        sourceId: result.id,
        recipientId,
      });
  return result;
}
export async function reviewCandidates(tx: UserDatabase, projectId: string) {
  return tx.$queryRaw<
    { id: string; name: string }[]
  >`SELECT * FROM app.review_candidates(${projectId}::uuid)`;
}
