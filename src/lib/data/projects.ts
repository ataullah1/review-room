import { AccessError } from "../auth/errors";
import {
  requireWorkspaceMember,
  requireWorkspaceOwner,
  requireProjectRole,
} from "./permissions";
import type { UserDatabase } from "./context";
import {
  createProjectSchema,
  projectMembersSchema,
  projectPageSize,
  type ProjectFilters,
} from "../../features/projects/validation";

export async function projectDirectory(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  filters: ProjectFilters,
) {
  const member = await requireWorkspaceMember(tx, userId, workspaceId);
  const where = {
    workspaceId,
    archivedAt: filters.status === "archived" ? { not: null } : null,
    ...(filters.q
      ? { name: { contains: filters.q, mode: "insensitive" as const } }
      : {}),
    ...(member.role === "OWNER"
      ? {}
      : { members: { some: { userId, workspaceId } } }),
  };
  const total = await tx.project.count({ where });
  const pages = Math.max(1, Math.ceil(total / projectPageSize));
  const page = Math.min(filters.page, pages);
  const projects = await tx.project.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * projectPageSize,
    take: projectPageSize,
    include: { _count: { select: { members: true } } },
  });
  return { projects, total, page, pages };
}
export async function assignableMembers(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
) {
  await requireWorkspaceOwner(tx, userId, workspaceId);
  return tx.membership.findMany({
    where: { workspaceId, role: { in: ["DESIGNER", "CLIENT"] } },
    select: {
      userId: true,
      role: true,
      user: { select: { displayName: true } },
    },
    orderBy: [{ createdAt: "asc" }, { userId: "asc" }],
  });
}
async function validateMembers(
  tx: UserDatabase,
  workspaceId: string,
  memberIds: string[],
) {
  const count = await tx.membership.count({
    where: {
      workspaceId,
      userId: { in: memberIds },
      role: { in: ["DESIGNER", "CLIENT"] },
    },
  });
  if (count !== memberIds.length)
    throw new AccessError(
      "Choose designers or clients from this workspace.",
      400,
    );
}
async function lockProject(tx: UserDatabase, projectId: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`project:${projectId}`}, 0))::text`;
}
export async function createProject(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  input: unknown,
) {
  await requireWorkspaceOwner(tx, userId, workspaceId);
  const { id, name, memberIds } = createProjectSchema.parse(input);
  await lockProject(tx, id);
  await validateMembers(tx, workspaceId, memberIds);
  const existing = await tx.project.findUnique({
    where: { id },
    include: { members: { select: { userId: true } } },
  });
  if (existing) {
    if (
      existing.workspaceId !== workspaceId ||
      existing.name !== name ||
      existing.members
        .map((m) => m.userId)
        .sort()
        .join() !== [...memberIds].sort().join()
    )
      throw new AccessError(
        "This request has already been used. Refresh and try again.",
        409,
      );
    return existing;
  }
  const project = await tx.project.create({ data: { id, workspaceId, name } });
  if (memberIds.length)
    await tx.projectMember.createMany({
      data: memberIds.map((userId) => ({ projectId: id, workspaceId, userId })),
    });
  return project;
}
export async function updateProjectMembers(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  input: unknown,
) {
  const { project } = await requireProjectRole(
    tx,
    userId,
    workspaceId,
    projectId,
    ["OWNER"],
  );
  await lockProject(tx, project.id);
  // Re-read after the lock so concurrent archive cannot race assignment changes.
  const current = await tx.project.findUniqueOrThrow({
    where: { id: project.id },
  });
  if (current.archivedAt)
    throw new AccessError(
      "Restore this project before changing its people.",
      409,
    );
  const { memberIds } = projectMembersSchema.parse(input);
  await validateMembers(tx, workspaceId, memberIds);
  await tx.projectMember.deleteMany({ where: { projectId, workspaceId } });
  if (memberIds.length)
    await tx.projectMember.createMany({
      data: memberIds.map((userId) => ({ projectId, workspaceId, userId })),
    });
}
export async function setProjectArchived(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  archived: boolean,
) {
  const { project } = await requireProjectRole(
    tx,
    userId,
    workspaceId,
    projectId,
    ["OWNER"],
  );
  await lockProject(tx, project.id);
  await tx.project.updateMany({
    where: {
      id: projectId,
      workspaceId,
      archivedAt: archived ? null : { not: null },
    },
    data: { archivedAt: archived ? new Date() : null },
  });
}
