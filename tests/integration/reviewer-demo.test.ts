import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { assertLocalDatabase } from "../../prisma/local-safety";
import {
  demoId,
  demoWorkspaceId as ws,
  demoProjects,
  demoSeedFiles,
  installDemoSeed,
  restoreDemoSeed,
  type DemoIdentity,
} from "../../src/features/reviewer-demo/seed";
import { bootstrapWorkspace } from "../../src/lib/data/bootstrap";
import { withUserDatabase } from "../../src/lib/data/context";
import {
  listProjects,
  requireProjectAccess,
} from "../../src/lib/data/permissions";
import { setProjectArchived } from "../../src/lib/data/projects";
import {
  createComment,
  resolveComment,
  threadPage,
} from "../../src/lib/data/comments";
import {
  decisionPage,
  submitDecision,
  versionPage,
} from "../../src/lib/data/reviews";
import { prepareUpload } from "../../src/lib/data/uploads";
const db = new PrismaClient({
  adapter: new PrismaPg(
    {
      connectionString: assertLocalDatabase(
        process.env.TEST_DATABASE_URL,
        "test",
      ),
    },
    { schema: "app" },
  ),
});
const people: DemoIdentity[] = ["OWNER", "DESIGNER", "CLIENT"].map((role) => ({
  id: demoId(`test:${role}`),
  role: role as DemoIdentity["role"],
  email: `demo@${role === "OWNER" ? "admin" : role.toLowerCase()}.com`,
}));
const [owner, designer, client] = people;
const project = demoProjects[0].id,
  asset = demoId("olive-identity"),
  v1 = demoId("olive-identity:v1"),
  v2 = demoId("olive-identity:v2");
const scope = <T>(
  user: string,
  op: Parameters<typeof withUserDatabase<T>>[2],
) => withUserDatabase(db, user, op);
let files: Awaited<ReturnType<typeof demoSeedFiles>>;
beforeAll(async () => {
  files = await demoSeedFiles(readFile);
  await installDemoSeed(db, people, files);
});
afterAll(async () => {
  if (
    (await db.reviewerDemoAccount.count({ where: { workspaceId: ws } })) === 3
  ) {
    await restoreDemoSeed(db, people);
    await db.reviewerDemoAccount.deleteMany({ where: { workspaceId: ws } });
    await db.membership.deleteMany({ where: { workspaceId: ws } });
    await db.workspace.delete({ where: { id: ws } });
    await db.userProfile.deleteMany({
      where: { id: { in: people.map((u) => u.id) } },
    });
  }
  await db.$disconnect();
});
describe("real reviewer demo database workflows", () => {
  it("installs coherent data once and reuses it without duplicates", async () => {
    expect((await installDemoSeed(db, people, files)).created).toBe(false);
    expect(await db.project.count({ where: { workspaceId: ws } })).toBe(3);
    expect(await db.assetVersion.count({ where: { workspaceId: ws } })).toBe(8);
    expect(
      await db.comment.count({ where: { version: { workspaceId: ws } } }),
    ).toBe(8);
    expect(
      await db.reviewDecision.count({
        where: { version: { workspaceId: ws } },
      }),
    ).toBe(4);
    expect(
      await db.activityEvent.count({ where: { workspaceId: ws } }),
    ).toBeGreaterThan(10);
  });
  it("upgrades the earlier two-project seed without deleting existing feedback", async () => {
    const note = await scope(client.id, (tx) =>
      createComment(tx, client.id, ws, project, asset, v2, {
        id: randomUUID(),
        body: "Keep this reviewer feedback during a seed upgrade.",
        xRatio: 0.3,
        yRatio: 0.4,
      }),
    );
    await db.asset.updateMany({
      where: { projectId: demoProjects[2].id },
      data: { currentVersionId: null },
    });
    await db.project.delete({ where: { id: demoProjects[2].id } });
    await db.projectMember.deleteMany({
      where: { projectId: demoProjects[1].id },
    });
    expect((await installDemoSeed(db, people, files)).created).toBe(true);
    expect(
      await db.comment.findUnique({ where: { id: note.id } }),
    ).not.toBeNull();
    expect(await db.project.count({ where: { workspaceId: ws } })).toBe(3);
    expect(
      await db.projectMember.count({
        where: { projectId: demoProjects[1].id },
      }),
    ).toBe(2);
    expect((await installDemoSeed(db, people, files)).created).toBe(false);
  });
  it("boots every role into the same workspace without promoting collaborators", async () => {
    for (const user of people) {
      expect(
        (
          await bootstrapWorkspace(db, {
            id: user.id,
            email: user.email,
            displayName: "Should not replace demo name",
          })
        ).id,
      ).toBe(ws);
      expect(
        (await db.membership.findMany({ where: { userId: user.id } })).map(
          (m) => m.role,
        ),
      ).toEqual([user.role]);
      const projects = await scope(user.id, (tx) =>
        listProjects(tx, user.id, ws),
      );
      expect(projects).toHaveLength(user.role === "OWNER" ? 3 : 2);
    }
  });
  it("preserves old deployed login lookups through an empty personal workspace without exposing its projects", async () => {
    const legacy = await db.workspace.create({
      data: { name: "Empty legacy demo workspace", createdById: designer.id },
    });
    await db.membership.create({
      data: { workspaceId: legacy.id, userId: designer.id, role: "OWNER" },
    });
    await db.reviewerDemoAccount.update({
      where: { userId: designer.id },
      data: { legacyWorkspaceId: legacy.id },
    });
    try {
      const lookup = await scope(designer.id, async (tx) => {
        const workspace = await tx.workspace.findUnique({
          where: { createdById: designer.id },
        });
        const membership = await tx.membership.findUnique({
          where: {
            workspaceId_userId: { workspaceId: legacy.id, userId: designer.id },
          },
        });
        return { workspace, membership };
      });
      expect(lookup.workspace?.id).toBe(legacy.id);
      expect(lookup.membership?.role).toBe("OWNER");
      expect(
        (
          await bootstrapWorkspace(db, {
            id: designer.id,
            email: designer.email,
          })
        ).id,
      ).toBe(ws);
      await expect(
        scope(designer.id, (tx) =>
          tx.project.create({
            data: { workspaceId: legacy.id, name: "Not allowed" },
          }),
        ),
      ).rejects.toThrow();
      expect(
        await scope(designer.id, (tx) =>
          tx.project.findMany({ where: { workspaceId: legacy.id } }),
        ),
      ).toEqual([]);
    } finally {
      await db.reviewerDemoAccount.update({
        where: { userId: designer.id },
        data: { legacyWorkspaceId: null },
      });
      await db.membership.deleteMany({ where: { workspaceId: legacy.id } });
      await db.workspace.delete({ where: { id: legacy.id } });
    }
  });
  it("keeps unassigned designs and cross-tenant records inaccessible even after accidental membership", async () => {
    for (const user of [designer, client])
      await expect(
        scope(user.id, (tx) =>
          requireProjectAccess(tx, user.id, ws, demoProjects[2].id),
        ),
      ).rejects.toThrow();
    const other = randomUUID(),
      otherProject = randomUUID();
    await db.workspace.create({
      data: { id: other, name: "Unauthorized local fixture" },
    });
    await db.project.create({
      data: { id: otherProject, workspaceId: other, name: "Hidden" },
    });
    await db.membership.create({
      data: { workspaceId: other, userId: owner.id, role: "OWNER" },
    });
    const otherAsset = randomUUID(),
      otherVersion = randomUUID();
    await db.asset.create({
      data: {
        id: otherAsset,
        workspaceId: other,
        projectId: otherProject,
        title: "Unauthorized design",
      },
    });
    await db.assetVersion.create({
      data: {
        id: otherVersion,
        assetId: otherAsset,
        workspaceId: other,
        projectId: otherProject,
        creatorId: owner.id,
        originalName: "other.webp",
        expectedMimeType: "image/webp",
        expectedSize: files[0].bytes.length,
        stagingKey: `local-only/${otherVersion}/pending`,
        objectKey: `local-only/${otherVersion}/original`,
        expiresAt: new Date(),
        cleanupAfter: new Date(),
      },
    });
    await db.assetVersion.update({
      where: { id: otherVersion },
      data: { status: "READY", ...files[0].metadata },
    });
    await db.asset.update({
      where: { id: otherAsset },
      data: { currentVersionId: otherVersion },
    });
    await db.comment.create({
      data: {
        id: randomUUID(),
        versionId: otherVersion,
        authorId: owner.id,
        threadNumber: 1,
        xRatio: 0.5,
        yRatio: 0.5,
        body: "Must never leak to the public demo account",
      },
    });
    try {
      expect(
        await scope(owner.id, (tx) =>
          tx.project.findMany({ where: { id: otherProject } }),
        ),
      ).toEqual([]);
      expect(
        await scope(owner.id, (tx) =>
          tx.workspace.findMany({ where: { id: other } }),
        ),
      ).toEqual([]);
      expect(
        await scope(owner.id, (tx) =>
          tx.comment.findMany({ where: { versionId: otherVersion } }),
        ),
      ).toEqual([]);
      expect(
        await scope(owner.id, (tx) =>
          tx.assetVersion.findMany({ where: { id: otherVersion } }),
        ),
      ).toEqual([]);
      await expect(
        scope(owner.id, (tx) =>
          tx.reviewerDemoAccount.update({
            where: { userId: owner.id },
            data: { allowAuthChanges: true },
          }),
        ),
      ).rejects.toThrow();
    } finally {
      await db.asset.update({
        where: { id: otherAsset },
        data: { currentVersionId: null },
      });
      await db.project.delete({ where: { id: otherProject } });
      await db.membership.deleteMany({ where: { workspaceId: other } });
      await db.workspace.delete({ where: { id: other } });
    }
  });
  it("loads author snapshots, normalized pins, version history and approval history", async () => {
    const threads = await scope(client.id, (tx) =>
      threadPage(tx, client.id, ws, project, asset, v1),
    );
    expect(threads.threads[0]).toMatchObject({
      authorName: "Client Demo",
      xRatio: 0.5,
      yRatio: 0.25,
      resolvedAt: expect.any(String),
    });
    expect(threads.threads[0].replies[0]).toMatchObject({
      authorName: "Designer Demo",
      versionId: v1,
    });
    expect(
      (
        await scope(client.id, (tx) =>
          versionPage(tx, client.id, ws, project, asset),
        )
      ).versions.map((v) => v.versionNumber),
    ).toEqual([2, 1]);
    expect(
      (
        await scope(client.id, (tx) =>
          decisionPage(tx, client.id, ws, project, asset, v2),
        )
      ).latest[0].decision,
    ).toBe("APPROVED");
  });
  it("uses actual comment/reply/resolve/decision logic with existing permissions", async () => {
    const root = await scope(client.id, (tx) =>
      createComment(tx, client.id, ws, project, asset, v2, {
        id: randomUUID(),
        body: "Could we adjust this final detail?",
        xRatio: 0.4,
        yRatio: 0.5,
      }),
    );
    const reply = await scope(designer.id, (tx) =>
      createComment(tx, designer.id, ws, project, asset, v2, {
        id: randomUUID(),
        body: "Yes, reviewing it now.",
        parentId: root.id,
      }),
    );
    expect(reply.authorName).toBe("Designer Demo");
    await expect(
      scope(client.id, (tx) =>
        resolveComment(tx, client.id, ws, project, asset, v2, root.id, true),
      ),
    ).rejects.toThrow();
    expect(
      (
        await scope(designer.id, (tx) =>
          resolveComment(
            tx,
            designer.id,
            ws,
            project,
            asset,
            v2,
            root.id,
            true,
          ),
        )
      ).resolvedAt,
    ).not.toBeNull();
    await expect(
      scope(owner.id, (tx) =>
        submitDecision(tx, owner.id, ws, project, asset, {
          id: randomUUID(),
          expectedCurrentVersionId: v2,
          decision: "APPROVED",
        }),
      ),
    ).rejects.toThrow();
    await expect(
      scope(client.id, (tx) =>
        submitDecision(tx, client.id, ws, project, asset, {
          id: randomUUID(),
          expectedCurrentVersionId: v1,
          decision: "APPROVED",
        }),
      ),
    ).rejects.toThrow();
    for (const decision of ["CHANGES_REQUESTED", "APPROVED"] as const)
      expect(
        (
          await scope(client.id, (tx) =>
            submitDecision(tx, client.id, ws, project, asset, {
              id: randomUUID(),
              expectedCurrentVersionId: v2,
              decision,
              note: "Final review in the public demo.",
            }),
          )
        ).decision,
      ).toBe(decision);
  });
  it("protects projects, membership and direct workspace creation at database level", async () => {
    await expect(
      scope(owner.id, (tx) =>
        setProjectArchived(tx, owner.id, ws, project, true),
      ),
    ).rejects.toThrow("Shared demo");
    await expect(
      scope(owner.id, (tx) =>
        tx.projectMember.deleteMany({ where: { projectId: project } }),
      ),
    ).rejects.toThrow();
    await expect(
      scope(designer.id, (tx) =>
        tx.workspace.create({
          data: { name: "Escalated owner workspace", createdById: designer.id },
        }),
      ),
    ).rejects.toThrow();
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: project } }))
        .archivedAt,
    ).toBeNull();
  });
  it("enforces durable concurrent mutation and upload limits", async () => {
    await db.reviewerDemoQuota.upsert({
      where: { userId: client.id },
      create: {
        userId: client.id,
        day: new Date(new Date().toISOString().slice(0, 10)),
        mutations: 99,
      },
      update: {
        day: new Date(new Date().toISOString().slice(0, 10)),
        mutations: 99,
      },
    });
    await db.$executeRaw`UPDATE app."ReviewerDemoQuota" SET day=date_trunc('day',now(),'UTC') WHERE "userId"=${client.id}::uuid`;
    const writes = await Promise.allSettled(
      [1, 2].map((i) =>
        scope(client.id, (tx) =>
          createComment(tx, client.id, ws, project, asset, v2, {
            id: randomUUID(),
            body: `Bounded review ${i}`,
            xRatio: 0.2,
            yRatio: 0.2,
          }),
        ),
      ),
    );
    expect(writes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await db.reviewerDemoQuota.deleteMany({ where: { userId: designer.id } });
    for (let i = 0; i < 4; i++)
      await scope(designer.id, (tx) =>
        prepareUpload(tx, designer.id, ws, project, {
          assetId: asset,
          name: "revision.webp",
          mimeType: "image/webp",
          size: 100,
        }),
      );
    await expect(
      scope(designer.id, (tx) =>
        prepareUpload(tx, designer.id, ws, project, {
          assetId: asset,
          name: "revision.webp",
          mimeType: "image/webp",
          size: 100,
        }),
      ),
    ).rejects.toThrow("Shared demo");
    await expect(
      scope(client.id, (tx) =>
        prepareUpload(tx, client.id, ws, project, {
          name: "forbidden.webp",
          mimeType: "image/webp",
          size: 100,
        }),
      ),
    ).rejects.toThrow();
  });
  it("protects public Auth credentials with the same trigger used on Supabase", async () => {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "CREATE TEMP TABLE reviewer_auth_fixture (id uuid,email text,email_change text,phone text,phone_change text,encrypted_password text,deleted_at timestamptz) ON COMMIT DROP",
      );
      await tx.$executeRawUnsafe(
        "CREATE TRIGGER protect_auth BEFORE UPDATE OR DELETE ON reviewer_auth_fixture FOR EACH ROW EXECUTE FUNCTION app.guard_reviewer_demo_auth()",
      );
      await tx.$executeRaw`INSERT INTO reviewer_auth_fixture(id,email,encrypted_password) VALUES(${owner.id}::uuid,'creator@local.example.test','private-hash')`;
      await tx.$executeRawUnsafe("SAVEPOINT auth_update");
      let denied = false;
      try {
        await tx.$executeRawUnsafe(
          "UPDATE reviewer_auth_fixture SET encrypted_password='takeover'",
        );
      } catch (error) {
        denied =
          error instanceof Error &&
          error.message.includes("Public demo account credentials");
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT auth_update");
      }
      expect(denied).toBe(true);
      expect(
        await tx.$queryRaw<
          { encrypted_password: string }[]
        >`SELECT encrypted_password FROM reviewer_auth_fixture`,
      ).toEqual([{ encrypted_password: "private-hash" }]);
    });
  });
  it("blocks MFA enrollment that could lock other reviewers out", async () => {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "CREATE TEMP TABLE reviewer_mfa_fixture (user_id uuid) ON COMMIT DROP",
      );
      await tx.$executeRawUnsafe(
        "CREATE TRIGGER protect_demo_mfa BEFORE INSERT ON reviewer_mfa_fixture FOR EACH ROW EXECUTE FUNCTION app.guard_reviewer_demo_mfa()",
      );
      await tx.$executeRawUnsafe("SAVEPOINT mfa_insert");
      let denied = false;
      try {
        await tx.$executeRaw`INSERT INTO reviewer_mfa_fixture(user_id) VALUES(${owner.id}::uuid)`;
      } catch (error) {
        denied =
          error instanceof Error &&
          error.message.includes("MFA enrollment is disabled");
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT mfa_insert");
      }
      expect(denied).toBe(true);
    });
  });
  it("restores only verified demo content, preserves public identities and leaves unrelated records alone", async () => {
    const unrelated = randomUUID();
    await db.workspace.create({
      data: { id: unrelated, name: "Must survive restore" },
    });
    try {
      await restoreDemoSeed(db, people);
      expect(
        await db.reviewerDemoAccount.count({ where: { workspaceId: ws } }),
      ).toBe(3);
      expect(
        await db.workspace.findUnique({ where: { id: unrelated } }),
      ).not.toBeNull();
      await installDemoSeed(db, people, files);
      expect(await db.assetVersion.count({ where: { workspaceId: ws } })).toBe(
        8,
      );
      expect(
        await scope(client.id, (tx) => listProjects(tx, client.id, ws)),
      ).toHaveLength(2);
    } finally {
      await db.workspace.delete({ where: { id: unrelated } });
    }
  });
});
