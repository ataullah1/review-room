import "server-only";
import { requireUser } from "@/lib/auth/user";
import { withUserDatabase } from "@/lib/data/context";
import {
  listProjects,
  requireWorkspaceMember,
  requireProjectAccess,
} from "@/lib/data/permissions";
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
export async function getWorkspaceProjects(workspaceId: string) {
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
      projects: await listProjects(tx, user.id, workspaceId),
    };
  });
}
export async function getProject(workspaceId: string, projectId: string) {
  const user = await requireUser();
  return withUserDatabase(
    getDb(),
    user.id,
    async (tx) =>
      (await requireProjectAccess(tx, user.id, workspaceId, projectId)).project,
  );
}
