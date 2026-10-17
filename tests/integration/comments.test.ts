import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { assertLocalDatabase } from "../../prisma/local-safety";
import {
  seedDevelopmentDatabase,
  fixtureIds as ids,
} from "../../prisma/seed-data";
import { withUserDatabase } from "../../src/lib/data/context";
import { prepareUpload } from "../../src/lib/data/uploads";
import {
  createComment,
  resolveComment,
  threadPage,
  replyPage,
  reviewVersion,
} from "../../src/lib/data/comments";
const url = assertLocalDatabase(process.env.TEST_DATABASE_URL, "test");
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }, { schema: "app" }),
});
const other = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }, { schema: "app" }),
});
const projectId = randomUUID();
let assetId: string,
  versionId: string,
  secondAssetId: string,
  secondVersionId: string;
const root = (body = "A precise detail") => ({
  id: randomUUID(),
  body,
  xRatio: 0.25,
  yRatio: 0.75,
});
const create = (
  userId: string,
  input: unknown,
  version = versionId,
  asset = assetId,
) =>
  withUserDatabase(db, userId, (tx) =>
    createComment(tx, userId, ids.workspace, projectId, asset, version, input),
  );
beforeAll(async () => {
  await seedDevelopmentDatabase(db);
  await db.project.create({
    data: {
      id: projectId,
      workspaceId: ids.workspace,
      name: "Comment test project",
    },
  });
  await db.projectMember.createMany({
    data: [ids.client, ids.designer].map((userId) => ({
      projectId,
      workspaceId: ids.workspace,
      userId,
    })),
  });
  for (let n = 0; n < 2; n++) {
    const row = await withUserDatabase(db, ids.owner, (tx) =>
      prepareUpload(tx, ids.owner, ids.workspace, projectId, {
        name: "fixture.png",
        mimeType: "image/png",
        size: 10,
      }),
    );
    await db.assetVersion.update({
      where: { id: row.id },
      data: {
        status: "READY",
        width: 400,
        height: 200,
        fileSize: 10,
        mimeType: "image/png",
        contentHash: "a".repeat(64),
      },
    });
    await db.asset.update({
      where: { id: row.assetId },
      data: { currentVersionId: row.id },
    });
    if (n === 0) {
      assetId = row.assetId;
      versionId = row.id;
    } else {
      secondAssetId = row.assetId;
      secondVersionId = row.id;
    }
  }
});
afterAll(async () => {
  await db.project.delete({ where: { id: projectId } });
  await db.$disconnect();
  await other.$disconnect();
});
describe("version-bound feedback under server checks and RLS", () => {
  it("client creates a root, designer replies, canonical author/text persists and retries do not duplicate", async () => {
    const input = root("  <b>Plain feedback</b>  ");
    const saved = await create(ids.client, input);
    expect(saved).toMatchObject({
      body: "<b>Plain feedback</b>",
      authorId: ids.client,
      authorName: "Sample client",
      xRatio: 0.25,
      yRatio: 0.75,
    });
    expect((await create(ids.client, input)).id).toBe(saved.id);
    const reply = await create(ids.designer, {
      id: randomUUID(),
      body: "Reply text",
      parentId: saved.id,
    });
    expect(reply).toMatchObject({
      parentId: saved.id,
      xRatio: null,
      yRatio: null,
      authorName: "Sample designer",
    });
    const page = await withUserDatabase(other, ids.owner, (tx) =>
      threadPage(tx, ids.owner, ids.workspace, projectId, assetId, versionId),
    );
    expect(
      page.threads.find((t) => t.id === saved.id)?.replies.map((r) => r.id),
    ).toContain(reply.id);
  });
  it("denies unassigned/outsider reads and direct mutations, with no body-edit or delete grant", async () => {
    for (const user of [ids.unassigned, ids.outsider]) {
      await expect(create(user, root())).rejects.toMatchObject({ status: 403 });
      expect(
        await withUserDatabase(db, user, (tx) =>
          tx.comment.findMany({ where: { versionId } }),
        ),
      ).toEqual([]);
      await expect(
        withUserDatabase(db, user, (tx) =>
          tx.comment.create({
            data: { ...root(), versionId, authorId: user, threadNumber: 1000 },
          }),
        ),
      ).rejects.toThrow();
    }
    const saved = await create(ids.client, root());
    await expect(
      withUserDatabase(db, ids.client, (tx) =>
        tx.comment.update({
          where: { id: saved.id },
          data: { body: "Changed" },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      withUserDatabase(db, ids.owner, (tx) =>
        tx.comment.delete({ where: { id: saved.id } }),
      ),
    ).rejects.toThrow();
  });
  it("rejects cross-version, nested reply parents, forged asset/version and out-of-range raw coordinates", async () => {
    const saved = await create(ids.client, root());
    await expect(
      create(
        ids.client,
        { id: randomUUID(), body: "wrong version", parentId: saved.id },
        secondVersionId,
        secondAssetId,
      ),
    ).rejects.toMatchObject({ status: 400 });
    const reply = await create(ids.client, {
      id: randomUUID(),
      body: "child",
      parentId: saved.id,
    });
    await expect(
      create(ids.client, {
        id: randomUUID(),
        body: "nested",
        parentId: reply.id,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      withUserDatabase(db, ids.owner, (tx) =>
        tx.comment.create({
          data: {
            id: randomUUID(),
            versionId: secondVersionId,
            authorId: ids.owner,
            parentId: saved.id,
            body: "Bypass",
          },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      withUserDatabase(db, ids.owner, (tx) =>
        tx.comment.create({
          data: {
            ...root(),
            xRatio: 2,
            versionId,
            authorId: ids.owner,
            threadNumber: 999,
          },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      withUserDatabase(db, ids.client, (tx) =>
        reviewVersion(
          tx,
          ids.client,
          ids.workspace,
          projectId,
          assetId,
          secondVersionId,
        ),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("only owner/assigned designer resolve or reopen roots; replies cannot resolve", async () => {
    const saved = await create(ids.client, root());
    await expect(
      withUserDatabase(db, ids.client, (tx) =>
        resolveComment(
          tx,
          ids.client,
          ids.workspace,
          projectId,
          assetId,
          versionId,
          saved.id,
          true,
        ),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      await withUserDatabase(db, ids.client, (tx) =>
        tx.comment.updateMany({
          where: { id: saved.id },
          data: { resolvedAt: new Date() },
        }),
      ),
    ).toEqual({ count: 0 });
    const resolved = await withUserDatabase(db, ids.designer, (tx) =>
      resolveComment(
        tx,
        ids.designer,
        ids.workspace,
        projectId,
        assetId,
        versionId,
        saved.id,
        true,
      ),
    );
    expect(resolved.resolvedAt).not.toBeNull();
    const reopened = await withUserDatabase(db, ids.owner, (tx) =>
      resolveComment(
        tx,
        ids.owner,
        ids.workspace,
        projectId,
        assetId,
        versionId,
        saved.id,
        false,
      ),
    );
    expect(reopened.resolvedAt).toBeNull();
    const reply = await create(ids.client, {
      id: randomUUID(),
      body: "reply",
      parentId: saved.id,
    });
    await expect(
      withUserDatabase(db, ids.owner, (tx) =>
        resolveComment(
          tx,
          ids.owner,
          ids.workspace,
          projectId,
          assetId,
          versionId,
          reply.id,
          true,
        ),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("allocates stable unique pin numbers across concurrent requests and paginates roots/replies without losing old messages", async () => {
    const inputs = Array.from({ length: 23 }, () => root());
    const saved = await Promise.all(
      inputs.map((input, i) =>
        withUserDatabase(i % 2 ? db : other, ids.client, (tx) =>
          createComment(
            tx,
            ids.client,
            ids.workspace,
            projectId,
            secondAssetId,
            secondVersionId,
            input,
          ),
        ),
      ),
    );
    expect(new Set(saved.map((r) => r.threadNumber)).size).toBe(23);
    const a = await withUserDatabase(db, ids.client, (tx) =>
      threadPage(
        tx,
        ids.client,
        ids.workspace,
        projectId,
        secondAssetId,
        secondVersionId,
      ),
    );
    const b = await withUserDatabase(db, ids.client, (tx) =>
      threadPage(
        tx,
        ids.client,
        ids.workspace,
        projectId,
        secondAssetId,
        secondVersionId,
        a.next!,
      ),
    );
    expect(a.threads).toHaveLength(20);
    expect(b.threads).toHaveLength(3);
    expect(new Set([...a.threads, ...b.threads].map((r) => r.id)).size).toBe(
      23,
    );
    const parent = saved[0];
    for (let n = 0; n < 7; n++)
      await create(
        ids.designer,
        { id: randomUUID(), body: `reply ${n}`, parentId: parent.id },
        secondVersionId,
        secondAssetId,
      );
    const page = await withUserDatabase(db, ids.client, (tx) =>
      threadPage(
        tx,
        ids.client,
        ids.workspace,
        projectId,
        secondAssetId,
        secondVersionId,
      ),
    );
    const thread = page.threads.find((t) => t.id === parent.id)!;
    expect(thread.moreReplies).toBe(true);
    const tail = await withUserDatabase(db, ids.client, (tx) =>
      replyPage(
        tx,
        ids.client,
        ids.workspace,
        projectId,
        secondAssetId,
        secondVersionId,
        parent.id,
        thread.replyCursor!,
      ),
    );
    expect(tail.replies).toHaveLength(2);
  });
  it("archive makes feedback read-only while retaining pins and bodies", async () => {
    await db.project.update({
      where: { id: projectId },
      data: { archivedAt: new Date() },
    });
    await expect(create(ids.client, root())).rejects.toMatchObject({
      status: 409,
    });
    expect(
      (
        await withUserDatabase(db, ids.client, (tx) =>
          threadPage(
            tx,
            ids.client,
            ids.workspace,
            projectId,
            assetId,
            versionId,
          ),
        )
      ).threads.length,
    ).toBeGreaterThan(0);
    await expect(
      withUserDatabase(db, ids.owner, (tx) =>
        tx.comment.create({
          data: {
            ...root(),
            versionId,
            authorId: ids.owner,
            threadNumber: 1001,
          },
        }),
      ),
    ).rejects.toThrow();
  });
});
