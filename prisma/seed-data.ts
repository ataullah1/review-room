import type { PrismaClient } from "../src/generated/prisma/client";

export const fixtureIds = {
  owner: "10000000-0000-4000-8000-000000000001",
  designer: "10000000-0000-4000-8000-000000000002",
  client: "10000000-0000-4000-8000-000000000003",
  outsider: "10000000-0000-4000-8000-000000000004",
  unassigned: "10000000-0000-4000-8000-000000000005",
  workspace: "20000000-0000-4000-8000-000000000001",
  otherWorkspace: "20000000-0000-4000-8000-000000000002",
  project: "30000000-0000-4000-8000-000000000001",
  otherProject: "30000000-0000-4000-8000-000000000002",
} as const;
const createdAt = new Date("2026-10-16T00:00:00.000Z");

// Only the guarded CLI/test harness may call this with a local fixture database.
// These identities are application fixtures, not Supabase sign-in accounts.
export async function seedDevelopmentDatabase(db: PrismaClient) {
  await db.$transaction(async (tx) => {
    for (const [id, displayName] of [
      [fixtureIds.owner, "Sample owner"],
      [fixtureIds.designer, "Sample designer"],
      [fixtureIds.client, "Sample client"],
      [fixtureIds.outsider, "Other workspace owner"],
      [fixtureIds.unassigned, "Unassigned sample designer"],
    ]) {
      await tx.userProfile.upsert({
        where: { id },
        update: { displayName },
        create: { id, displayName, createdAt },
      });
    }
    for (const [id, name] of [
      [fixtureIds.workspace, "Sample studio"],
      [fixtureIds.otherWorkspace, "Other sample workspace"],
    ]) {
      await tx.workspace.upsert({
        where: { id },
        update: { name },
        create: { id, name, createdAt },
      });
    }
    const memberships = [
      {
        workspaceId: fixtureIds.workspace,
        userId: fixtureIds.owner,
        role: "OWNER" as const,
      },
      {
        workspaceId: fixtureIds.workspace,
        userId: fixtureIds.designer,
        role: "DESIGNER" as const,
      },
      {
        workspaceId: fixtureIds.workspace,
        userId: fixtureIds.client,
        role: "CLIENT" as const,
      },
      {
        workspaceId: fixtureIds.workspace,
        userId: fixtureIds.unassigned,
        role: "DESIGNER" as const,
      },
      {
        workspaceId: fixtureIds.otherWorkspace,
        userId: fixtureIds.outsider,
        role: "OWNER" as const,
      },
    ];
    for (const membership of memberships) {
      const { workspaceId, userId } = membership;
      await tx.membership.upsert({
        where: { workspaceId_userId: { workspaceId, userId } },
        update: { role: membership.role },
        create: { ...membership, createdAt },
      });
    }
    for (const project of [
      {
        id: fixtureIds.project,
        workspaceId: fixtureIds.workspace,
        name: "Sample brand exploration",
      },
      {
        id: fixtureIds.otherProject,
        workspaceId: fixtureIds.otherWorkspace,
        name: "Other workspace sample",
      },
    ]) {
      await tx.project.upsert({
        where: { id: project.id },
        update: { name: project.name },
        create: { ...project, createdAt },
      });
    }
    for (const userId of [fixtureIds.designer, fixtureIds.client]) {
      await tx.projectMember.upsert({
        where: { projectId_userId: { projectId: fixtureIds.project, userId } },
        update: {},
        create: {
          projectId: fixtureIds.project,
          workspaceId: fixtureIds.workspace,
          userId,
          createdAt,
        },
      });
    }
  });
}
