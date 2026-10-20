import type { PrismaClient } from "../../generated/prisma/client";
import { isExistingDemoEmail } from "../../features/reviewer-demo/config";
import { withUserDatabase } from "./context";

export type VerifiedIdentity = {
  id: string;
  email?: string;
  displayName?: string;
};
export async function bootstrapWorkspace(
  db: PrismaClient,
  user: VerifiedIdentity,
) {
  return withUserDatabase(db, user.id, async (tx) => {
    // Serialize first requests for one verified Auth ID. Database uniqueness is
    // the final guard, including across processes and retries after partial failure.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${user.id}, 0))::text`;
    const displayName = user.displayName?.trim().slice(0, 80) || "New member";
    await tx.userProfile.upsert({
      where: { id: user.id },
      update: {},
      create: { id: user.id, displayName },
    });
    const demo = isExistingDemoEmail(user.email)
      ? await tx.reviewerDemoAccount.findUnique({
          where: { userId: user.id },
          select: { workspaceId: true },
        })
      : null;
    if (demo) {
      const membership = await tx.membership.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: demo.workspaceId,
            userId: user.id,
          },
        },
      });
      if (!membership)
        throw new Error(
          "Demo membership is missing. Ask the demo operator to restore the seed.",
        );
      return tx.workspace.findUniqueOrThrow({
        where: { id: demo.workspaceId },
      });
    }
    const existing = await tx.workspace.findUnique({
      where: { createdById: user.id },
    });
    if (existing) {
      // Repair a missing owner edge atomically; a different role is never promoted.
      const member = await tx.membership.findUnique({
        where: {
          workspaceId_userId: { workspaceId: existing.id, userId: user.id },
        },
      });
      if (!member)
        await tx.membership.create({
          data: { workspaceId: existing.id, userId: user.id, role: "OWNER" },
        });
      return existing;
    }
    const workspace = await tx.workspace.create({
      data: {
        name: `${displayName}'s workspace`.slice(0, 100),
        createdById: user.id,
      },
    });
    await tx.membership.create({
      data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" },
    });
    return workspace;
  });
}
