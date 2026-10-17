import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { assertLocalDatabase } from "../../prisma/local-safety";
import {
  fixtureIds as ids,
  seedDevelopmentDatabase,
} from "../../prisma/seed-data";

const connectionString = assertLocalDatabase(
  process.env.TEST_DATABASE_URL,
  "test",
);
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString }, { schema: "app" }),
});
beforeAll(async () => {
  await seedDevelopmentDatabase(db);
  await seedDevelopmentDatabase(db);
});
afterAll(async () => {
  await db.$disconnect();
});
describe("PostgreSQL foundation", () => {
  it("keeps application tables private by default", async () => {
    const tables = await db.$queryRaw<
      Array<{ tablename: string; rowsecurity: boolean }>
    >`
      SELECT tablename, rowsecurity FROM pg_tables
      WHERE schemaname = 'app' AND tablename <> '_prisma_migrations'
    `;
    expect(tables).toHaveLength(10);
    expect(tables.every((table) => table.rowsecurity)).toBe(true);
    const privileges = await db.$queryRaw<Array<{ grants: number }>>`
      SELECT COUNT(*)::int AS grants FROM pg_namespace n
      CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a
      WHERE n.nspname = 'app' AND a.grantee = 0
    `;
    expect(privileges[0].grants).toBe(0);
  });

  it("repeated seeding retains stable fixtures without duplicates", async () => {
    expect(await db.workspace.count()).toBe(2);
    expect(await db.userProfile.count()).toBe(5);
    expect(await db.membership.count()).toBe(5);
    expect(await db.project.count()).toBe(2);
    expect(await db.projectMember.count()).toBe(2);
  });
  it("enforces unique workspace membership", async () => {
    await expect(
      db.membership.create({
        data: { workspaceId: ids.workspace, userId: ids.owner, role: "CLIENT" },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    expect(
      (
        await db.membership.findUniqueOrThrow({
          where: {
            workspaceId_userId: {
              workspaceId: ids.workspace,
              userId: ids.owner,
            },
          },
        })
      ).role,
    ).toBe("OWNER");
  });
  it("rejects assigning a user through an unrelated workspace membership", async () => {
    await expect(
      db.projectMember.create({
        data: {
          projectId: ids.project,
          workspaceId: ids.otherWorkspace,
          userId: ids.outsider,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
    await expect(
      db.projectMember.create({
        data: {
          projectId: ids.project,
          workspaceId: ids.workspace,
          userId: ids.outsider,
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
  it("retains an unassigned member fixture and UTC timestamps", async () => {
    expect(
      await db.projectMember.count({ where: { userId: ids.unassigned } }),
    ).toBe(0);
    const workspace = await db.workspace.findUniqueOrThrow({
      where: { id: ids.workspace },
    });
    expect(workspace.createdAt.toISOString()).toBe("2026-10-16T00:00:00.000Z");
  });
});
