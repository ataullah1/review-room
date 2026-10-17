import "server-only";
import { requireUser } from "@/lib/auth/user";
import { withUserDatabase } from "@/lib/data/context";
import {
  requireWorkspaceMember,
  requireProjectAccess,
} from "@/lib/data/permissions";
import { projectDirectory, assignableMembers } from "@/lib/data/projects";
import { projectFilters } from "@/features/projects/validation";
import { listAssets } from "@/lib/data/uploads";
import { getDb } from "./db";

export async function getUserWorkspaces() {
  const user = await requireUser();
  return withUserDatabase(getDb(), user.id, async (tx) => ({
    user,
    memberships: await tx.membership.findMany({
      where: { userId: user.id },
      include: { workspace: true },
      orderBy: { createdAt: "asc" },
    }),
  }));
}
export async function getWorkspaceProjects(
  workspaceId: string,
  input: { q?: string; status?: string; page?: string } = {},
) {
  const user = await requireUser();
  return withUserDatabase(getDb(), user.id, async (tx) => {
    const member = await requireWorkspaceMember(tx, user.id, workspaceId);
    const workspace = await tx.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
    });
    return {
      user,
      member,
      workspace,
      ...(await projectDirectory(
        tx,
        user.id,
        workspaceId,
        projectFilters(input),
      )),
    };
  });
}
export async function getProject(
  workspaceId: string,
  projectId: string,
  assetPage = 1,
) {
  const user = await requireUser();
  return withUserDatabase(getDb(), user.id, async (tx) => {
    const { project, member } = await requireProjectAccess(
      tx,
      user.id,
      workspaceId,
      projectId,
    );
    return {
      project,
      member,
      assetDirectory: await listAssets(
        tx,
        user.id,
        workspaceId,
        projectId,
        assetPage,
      ),
      people:
        member.role === "OWNER"
          ? await assignableMembers(tx, user.id, workspaceId)
          : [],
      assignedIds:
        member.role === "OWNER"
          ? (
              await tx.projectMember.findMany({
                where: { projectId, workspaceId },
                select: { userId: true },
              })
            ).map((m) => m.userId)
          : [],
    };
  });
}
export async function getProjectCreation(workspaceId: string) {
  const user = await requireUser();
  return withUserDatabase(getDb(), user.id, async (tx) => ({
    people: await assignableMembers(tx, user.id, workspaceId),
    workspace: await tx.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
    }),
  }));
}
