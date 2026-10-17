import { z } from "zod";
import { AccessError } from "../auth/errors";
import type { UserDatabase } from "./context";
import type { WorkspaceRole } from "../../generated/prisma/client";

function requireId(id: string) {
  if (!z.uuid().safeParse(id).success) throw new AccessError();
}
export async function requireWorkspaceMember(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
) {
  requireId(workspaceId);
  const member = await tx.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!member) throw new AccessError();
  return member;
}
export async function requireWorkspaceOwner(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
) {
  const member = await requireWorkspaceMember(tx, userId, workspaceId);
  if (member.role !== "OWNER") throw new AccessError();
  return member;
}
export async function requireProjectAccess(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
) {
  requireId(projectId);
  const member = await requireWorkspaceMember(tx, userId, workspaceId);
  const project = await tx.project.findFirst({
    where: {
      id: projectId,
      workspaceId,
      ...(member.role === "OWNER"
        ? {}
        : { members: { some: { userId, workspaceId } } }),
    },
  });
  if (!project) throw new AccessError();
  return { project, member };
}
export async function requireProjectRole(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  roles: readonly WorkspaceRole[],
) {
  const access = await requireProjectAccess(tx, userId, workspaceId, projectId);
  if (!roles.includes(access.member.role)) throw new AccessError();
  return access;
}
export async function listProjects(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
) {
  const member = await requireWorkspaceMember(tx, userId, workspaceId);
  return tx.project.findMany({
    where: {
      workspaceId,
      ...(member.role === "OWNER"
        ? {}
        : { members: { some: { userId, workspaceId } } }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
  });
}
export async function renameWorkspace(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  name: string,
) {
  await requireWorkspaceOwner(tx, userId, workspaceId);
  const validName = z.string().trim().min(2).max(100).parse(name);
  return tx.workspace.update({
    where: { id: workspaceId },
    data: { name: validName },
  });
}
