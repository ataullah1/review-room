import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { assertLocalDatabase } from "../../prisma/local-safety";
import {
  seedDevelopmentDatabase,
  fixtureIds as ids,
} from "../../prisma/seed-data";
import {
  withUserDatabase,
  type UserDatabase,
} from "../../src/lib/data/context";
import {
  createProject,
  updateProjectMembers,
  setProjectArchived,
  projectDirectory,
  assignableMembers,
} from "../../src/lib/data/projects";
import { requireProjectAccess } from "../../src/lib/data/permissions";
import { projectFilters } from "../../src/features/projects/validation";
const connectionString = assertLocalDatabase(
  process.env.TEST_DATABASE_URL,
  "test",
);
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString }, { schema: "app" }),
});
const second = new PrismaClient({
  adapter: new PrismaPg({ connectionString }, { schema: "app" }),
});
const projectIds: string[] = [];
const requestId = () => {
  const id = randomUUID();
  projectIds.push(id);
  return id;
};
const run = <T>(userId: string, op: (tx: UserDatabase) => Promise<T>) =>
  withUserDatabase(db, userId, op);
const create = (name: string, memberIds: string[] = []) => {
  const id = requestId();
  return run(ids.owner, (tx) =>
    createProject(tx, ids.owner, ids.workspace, { id, name, memberIds }),
  );
};
beforeAll(async () => {
  await seedDevelopmentDatabase(db);
});
afterAll(async () => {
  await db.project.deleteMany({ where: { id: { in: projectIds } } });
  await db.$disconnect();
  await second.$disconnect();
});
describe("project foundation", () => {
  it("owner creates a validated project with explicit designer/client assignments", async () => {
    const project = await create("  Summer campaign  ", [
      ids.designer,
      ids.client,
      ids.client,
    ]);
    expect(project.name).toBe("Summer campaign");
    expect(
      await db.projectMember.count({ where: { projectId: project.id } }),
    ).toBe(2);
    for (const user of [ids.owner, ids.designer, ids.client])
      expect(
        (
          await run(user, (tx) =>
            requireProjectAccess(tx, user, ids.workspace, project.id),
          )
        ).project.id,
      ).toBe(project.id);
    for (const user of [ids.unassigned, ids.outsider])
      await expect(
        run(user, (tx) =>
          requireProjectAccess(tx, user, ids.workspace, project.id),
        ),
      ).rejects.toMatchObject({ status: 403 });
  });
  it("retries concurrent create submissions without duplicate projects or members", async () => {
    const id = requestId();
    const input = { id, name: "Concurrent project", memberIds: [ids.designer] };
    const projects = await Promise.all([
      withUserDatabase(db, ids.owner, (tx) =>
        createProject(tx, ids.owner, ids.workspace, input),
      ),
      withUserDatabase(second, ids.owner, (tx) =>
        createProject(tx, ids.owner, ids.workspace, input),
      ),
    ]);
    expect(projects[0].id).toBe(projects[1].id);
    expect(await db.projectMember.count({ where: { projectId: id } })).toBe(1);
    await expect(
      run(ids.owner, (tx) =>
        createProject(tx, ids.owner, ids.workspace, {
          ...input,
          name: "Changed",
        }),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("rejects creation by nonowners and forged workspace IDs at server and RLS boundaries", async () => {
    for (const user of [
      ids.designer,
      ids.client,
      ids.unassigned,
      ids.outsider,
    ]) {
      const id = requestId();
      await expect(
        run(user, (tx) =>
          createProject(tx, user, ids.workspace, { id, name: "Forbidden" }),
        ),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        run(user, (tx) =>
          tx.project.create({
            data: { id, workspaceId: ids.workspace, name: "Bypass" },
          }),
        ),
      ).rejects.toThrow();
    }
    await expect(
      run(ids.owner, (tx) =>
        createProject(tx, ids.owner, ids.otherWorkspace, {
          id: requestId(),
          name: "Wrong tenant",
        }),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("rejects foreign, missing and OWNER assignments atomically", async () => {
    for (const target of [ids.outsider, ids.owner, randomUUID()]) {
      const id = requestId();
      await expect(
        run(ids.owner, (tx) =>
          createProject(tx, ids.owner, ids.workspace, {
            id,
            name: "Invalid member",
            memberIds: [ids.designer, target],
          }),
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(await db.project.findUnique({ where: { id } })).toBeNull();
    }
  });
  it("owner reads own workspace member names without global profile visibility", async () => {
    const people = await run(ids.owner, (tx) =>
      assignableMembers(tx, ids.owner, ids.workspace),
    );
    expect(people.map((p) => p.userId).sort()).toEqual(
      [ids.designer, ids.client, ids.unassigned].sort(),
    );
    expect(people.every((p) => p.user.displayName.length > 0)).toBe(true);
    expect(
      (await run(ids.owner, (tx) => tx.userProfile.findMany())).map(
        (p) => p.id,
      ),
    ).not.toContain(ids.outsider);
    await expect(
      run(ids.designer, (tx) =>
        assignableMembers(tx, ids.designer, ids.workspace),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("replacement assignment grants and revokes access without changing workspace roles", async () => {
    const project = await create("People updates", [ids.designer]);
    await run(ids.owner, (tx) =>
      updateProjectMembers(tx, ids.owner, ids.workspace, project.id, {
        memberIds: [ids.client, ids.unassigned],
      }),
    );
    await expect(
      run(ids.designer, (tx) =>
        requireProjectAccess(tx, ids.designer, ids.workspace, project.id),
      ),
    ).rejects.toMatchObject({ status: 403 });
    for (const user of [ids.client, ids.unassigned])
      expect(
        (
          await run(user, (tx) =>
            requireProjectAccess(tx, user, ids.workspace, project.id),
          )
        ).project.id,
      ).toBe(project.id);
    expect(
      (
        await db.membership.findUniqueOrThrow({
          where: {
            workspaceId_userId: {
              workspaceId: ids.workspace,
              userId: ids.client,
            },
          },
        })
      ).role,
    ).toBe("CLIENT");
    await expect(
      run(ids.owner, (tx) =>
        updateProjectMembers(tx, ids.owner, ids.workspace, project.id, {
          memberIds: [ids.outsider],
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      await db.projectMember.count({ where: { projectId: project.id } }),
    ).toBe(2);
  });
  it("nonowners cannot change assignments or archive through helper or bare writes", async () => {
    const project = await create("Locked writes", [ids.designer, ids.client]);
    for (const user of [
      ids.designer,
      ids.client,
      ids.unassigned,
      ids.outsider,
    ]) {
      await expect(
        run(user, (tx) =>
          updateProjectMembers(tx, user, ids.workspace, project.id, {
            memberIds: [ids.unassigned],
          }),
        ),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        run(user, (tx) =>
          setProjectArchived(tx, user, ids.workspace, project.id, true),
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(
        await run(user, (tx) =>
          tx.project.updateMany({
            where: { id: project.id },
            data: { archivedAt: new Date() },
          }),
        ),
      ).toEqual({ count: 0 });
      expect(
        await run(user, (tx) =>
          tx.projectMember.deleteMany({ where: { projectId: project.id } }),
        ),
      ).toEqual({ count: 0 });
      await expect(
        run(user, (tx) =>
          tx.projectMember.create({
            data: {
              workspaceId: ids.workspace,
              projectId: project.id,
              userId: ids.unassigned,
            },
          }),
        ),
      ).rejects.toThrow();
    }
  });
  it("denies owner attempts using a project from a different workspace", async () => {
    await expect(
      run(ids.owner, (tx) =>
        updateProjectMembers(tx, ids.owner, ids.workspace, ids.otherProject, {
          memberIds: [],
        }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      run(ids.owner, (tx) =>
        setProjectArchived(
          tx,
          ids.owner,
          ids.workspace,
          ids.otherProject,
          true,
        ),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      run(ids.owner, (tx) =>
        tx.projectMember.create({
          data: {
            workspaceId: ids.workspace,
            projectId: ids.otherProject,
            userId: ids.designer,
          },
        }),
      ),
    ).rejects.toThrow();
  });
  it("archive preserves assignments, hides active listing, supports detail and idempotent restore", async () => {
    const project = await create("Archive sample", [ids.client]);
    await run(ids.owner, (tx) =>
      setProjectArchived(tx, ids.owner, ids.workspace, project.id, true),
    );
    const first = await db.project.findUniqueOrThrow({
      where: { id: project.id },
    });
    await run(ids.owner, (tx) =>
      setProjectArchived(tx, ids.owner, ids.workspace, project.id, true),
    );
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: project.id } }))
        .archivedAt,
    ).toEqual(first.archivedAt);
    expect(
      await db.projectMember.count({ where: { projectId: project.id } }),
    ).toBe(1);
    const active = await run(ids.client, (tx) =>
      projectDirectory(
        tx,
        ids.client,
        ids.workspace,
        projectFilters({ q: "Archive sample" }),
      ),
    );
    expect(active.total).toBe(0);
    const archived = await run(ids.client, (tx) =>
      projectDirectory(
        tx,
        ids.client,
        ids.workspace,
        projectFilters({ q: "Archive sample", status: "archived" }),
      ),
    );
    expect(archived.projects.map((p) => p.id)).toEqual([project.id]);
    expect(
      (
        await run(ids.client, (tx) =>
          requireProjectAccess(tx, ids.client, ids.workspace, project.id),
        )
      ).project.id,
    ).toBe(project.id);
    await expect(
      run(ids.owner, (tx) =>
        updateProjectMembers(tx, ids.owner, ids.workspace, project.id, {
          memberIds: [],
        }),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await run(ids.owner, (tx) =>
        tx.projectMember.deleteMany({ where: { projectId: project.id } }),
      ),
    ).toEqual({ count: 0 });
    await run(ids.owner, (tx) =>
      setProjectArchived(tx, ids.owner, ids.workspace, project.id, false),
    );
    await run(ids.owner, (tx) =>
      setProjectArchived(tx, ids.owner, ids.workspace, project.id, false),
    );
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: project.id } }))
        .archivedAt,
    ).toBeNull();
  });
  it("search and count remain scoped, with stable nonoverlapping server pages", async () => {
    const prefix = `Pagination ${randomUUID()}`;
    for (let i = 0; i < 14; i++)
      await create(`${prefix} ${i}`, i < 2 ? [ids.designer] : []);
    const a = await run(ids.owner, (tx) =>
      projectDirectory(
        tx,
        ids.owner,
        ids.workspace,
        projectFilters({ q: prefix.toLowerCase() }),
      ),
    );
    const b = await run(ids.owner, (tx) =>
      projectDirectory(
        tx,
        ids.owner,
        ids.workspace,
        projectFilters({ q: prefix, page: "2" }),
      ),
    );
    expect(a.total).toBe(14);
    expect(a.pages).toBe(2);
    expect(a.projects).toHaveLength(12);
    expect(b.projects).toHaveLength(2);
    expect(new Set([...a.projects, ...b.projects].map((p) => p.id)).size).toBe(
      14,
    );
    const assigned = await run(ids.designer, (tx) =>
      projectDirectory(
        tx,
        ids.designer,
        ids.workspace,
        projectFilters({ q: prefix }),
      ),
    );
    expect(assigned.total).toBe(2);
    expect(
      (
        await run(ids.unassigned, (tx) =>
          projectDirectory(
            tx,
            ids.unassigned,
            ids.workspace,
            projectFilters({ q: prefix }),
          ),
        )
      ).total,
    ).toBe(0);
    expect(
      (
        await run(ids.owner, (tx) =>
          projectDirectory(
            tx,
            ids.owner,
            ids.workspace,
            projectFilters({ q: prefix, page: "999" }),
          ),
        )
      ).page,
    ).toBe(2);
    await expect(
      run(ids.outsider, (tx) =>
        projectDirectory(tx, ids.outsider, ids.workspace, projectFilters()),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (
        await run(ids.owner, (tx) =>
          projectDirectory(
            tx,
            ids.owner,
            ids.workspace,
            projectFilters({ q: "Other workspace sample" }),
          ),
        )
      ).total,
    ).toBe(0);
  });
});
