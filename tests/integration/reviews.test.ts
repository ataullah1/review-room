import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { assertLocalDatabase } from "../../prisma/local-safety";
import {
  seedDevelopmentDatabase,
  fixtureIds as ids,
} from "../../prisma/seed-data";
import { withUserDatabase } from "../../src/lib/data/context";
import {
  prepareUpload,
  claimUpload,
  publishUpload,
} from "../../src/lib/data/uploads";
import {
  createComment,
  resolveComment,
  threadPage,
} from "../../src/lib/data/comments";
import {
  submitDecision,
  decisionPage,
  versionPage,
} from "../../src/lib/data/reviews";
const url = assertLocalDatabase(process.env.TEST_DATABASE_URL, "test");
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }, { schema: "app" }),
});
const other = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }, { schema: "app" }),
});
const projectId = randomUUID(),
  secondClient = randomUUID();
const file = { name: "revision.png", mimeType: "image/png", size: 10 };
const metadata = {
  mimeType: "image/png",
  fileSize: 10,
  width: 400,
  height: 200,
  contentHash: "b".repeat(64),
};
const scope = <T>(
  user: string,
  op: Parameters<typeof withUserDatabase<T>>[2],
  client = db,
) => withUserDatabase(client, user, op);
const prepare = (assetId?: string, user: string = ids.designer) =>
  scope(user, (tx) =>
    prepareUpload(tx, user, ids.workspace, projectId, { ...file, assetId }),
  );
async function ready(assetId?: string) {
  const row = await prepare(assetId);
  const claim = await scope(ids.designer, (tx) =>
    claimUpload(tx, ids.designer, ids.workspace, projectId, row.id),
  );
  await scope(ids.designer, (tx) =>
    publishUpload(
      tx,
      ids.designer,
      ids.workspace,
      projectId,
      row.id,
      claim.token!,
      metadata,
    ),
  );
  return row;
}
const input = (
  versionId: string,
  decision: "APPROVED" | "CHANGES_REQUESTED" = "APPROVED",
  note?: string,
) => ({
  id: randomUUID(),
  expectedCurrentVersionId: versionId,
  decision,
  note,
});
const decide = (
  assetId: string,
  data: unknown,
  user: string = ids.client,
  client = db,
) =>
  scope(
    user,
    (tx) => submitDecision(tx, user, ids.workspace, projectId, assetId, data),
    client,
  );
const decisions = (assetId: string, versionId: string) =>
  scope(ids.client, (tx) =>
    decisionPage(tx, ids.client, ids.workspace, projectId, assetId, versionId),
  );
const gate = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
beforeAll(async () => {
  await seedDevelopmentDatabase(db);
  await db.project.create({
    data: {
      id: projectId,
      workspaceId: ids.workspace,
      name: "Version review tests",
    },
  });
  await db.userProfile.create({
    data: { id: secondClient, displayName: "Second reviewer" },
  });
  await db.membership.create({
    data: { workspaceId: ids.workspace, userId: secondClient, role: "CLIENT" },
  });
  await db.projectMember.createMany({
    data: [ids.client, ids.designer, secondClient].map((userId) => ({
      projectId,
      workspaceId: ids.workspace,
      userId,
    })),
  });
});
beforeEach(async () => {
  await db.assetVersion.updateMany({
    where: { projectId, status: "PENDING" },
    data: { status: "FAILED" },
  });
  await db.project.update({
    where: { id: projectId },
    data: { archivedAt: null },
  });
});
afterAll(async () => {
  await db.project.delete({ where: { id: projectId } });
  await db.membership.delete({
    where: {
      workspaceId_userId: { workspaceId: ids.workspace, userId: secondClient },
    },
  });
  await db.userProfile.delete({ where: { id: secondClient } });
  await db.$disconnect();
  await other.$disconnect();
});
describe("immutable versions and assigned-client decisions", () => {
  it("publishes a distinct version, retains old pins/decisions and starts fresh review", async () => {
    const first = await ready();
    const pin = await scope(ids.client, (tx) =>
      createComment(
        tx,
        ids.client,
        ids.workspace,
        projectId,
        first.assetId,
        first.id,
        {
          id: randomUUID(),
          body: "Version one detail",
          xRatio: 0.1,
          yRatio: 0.8,
        },
      ),
    );
    await decide(first.assetId, input(first.id));
    const second = await ready(first.assetId);
    expect(second.versionNumber).toBe(2);
    expect(second.objectKey).not.toBe(first.objectKey);
    expect((await decisions(first.assetId, second.id)).latest).toEqual([]);
    expect((await decisions(first.assetId, first.id)).latest[0].decision).toBe(
      "APPROVED",
    );
    const page = await scope(ids.client, (tx) =>
      threadPage(
        tx,
        ids.client,
        ids.workspace,
        projectId,
        first.assetId,
        first.id,
      ),
    );
    expect(page.threads[0].id).toBe(pin.id);
    expect(
      (
        await scope(ids.client, (tx) =>
          threadPage(
            tx,
            ids.client,
            ids.workspace,
            projectId,
            first.assetId,
            second.id,
          ),
        )
      ).threads,
    ).toEqual([]);
    await expect(
      scope(ids.client, (tx) =>
        createComment(
          tx,
          ids.client,
          ids.workspace,
          projectId,
          first.assetId,
          first.id,
          { id: randomUUID(), body: "Stale", xRatio: 0.5, yRatio: 0.5 },
        ),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      scope(ids.designer, (tx) =>
        resolveComment(
          tx,
          ids.designer,
          ids.workspace,
          projectId,
          first.assetId,
          first.id,
          pin.id,
          true,
        ),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      scope(ids.client, (tx) =>
        tx.comment.create({
          data: {
            id: randomUUID(),
            versionId: first.id,
            authorId: ids.client,
            body: "raw historical",
            xRatio: 0,
            yRatio: 0,
            threadNumber: 99,
          },
        }),
      ),
    ).rejects.toThrow();
    const versions = await scope(ids.client, (tx) =>
      versionPage(tx, ids.client, ids.workspace, projectId, first.assetId),
    );
    expect(versions.versions.map((v) => v.versionNumber)).toEqual([2, 1]);
    expect(versions.versions[0].uploader).toBe("Sample designer");
  });
  it("retries one canonical decision once, keeps changes history and separates two reviewers", async () => {
    const row = await ready(),
      data = input(row.id);
    const saved = await Promise.all([
      decide(row.assetId, data),
      decide(row.assetId, data, ids.client, other),
    ]);
    expect(saved[0].id).toBe(saved[1].id);
    expect(saved[0].reviewerName).toBe("Sample client");
    await decide(
      row.assetId,
      input(row.id, "CHANGES_REQUESTED", "Please adjust spacing."),
    );
    await decide(row.assetId, input(row.id), secondClient);
    const page = await decisions(row.assetId, row.id);
    expect(page.history).toHaveLength(3);
    expect(page.latest).toHaveLength(2);
    expect(page.latest.find((d) => d.reviewerId === ids.client)?.decision).toBe(
      "CHANGES_REQUESTED",
    );
    expect(
      page.latest.find((d) => d.reviewerId === secondClient)?.decision,
    ).toBe("APPROVED");
    expect(await db.reviewDecision.count({ where: { id: data.id } })).toBe(1);
    await expect(
      decide(row.assetId, { ...data, note: "Changed request" }),
    ).rejects.toMatchObject({ status: 409 });
    await ready(row.assetId);
    expect((await decide(row.assetId, data)).id).toBe(data.id);
  });
  it("denies designer/owner decisions, outsiders, forged scope, raw edits and empty change notes", async () => {
    const row = await ready(),
      data = input(row.id);
    for (const user of [
      ids.owner,
      ids.designer,
      ids.unassigned,
      ids.outsider,
    ]) {
      await expect(decide(row.assetId, data, user)).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        scope(user, (tx) =>
          tx.reviewDecision.create({
            data: {
              id: randomUUID(),
              versionId: row.id,
              reviewerId: user,
              decision: "APPROVED",
            },
          }),
        ),
      ).rejects.toThrow();
    }
    expect(
      await scope(ids.outsider, (tx) =>
        tx.reviewDecision.findMany({ where: { versionId: row.id } }),
      ),
    ).toEqual([]);
    await expect(
      decide(row.assetId, input(row.id, "CHANGES_REQUESTED", "  ")),
    ).rejects.toThrow();
    await expect(decide(randomUUID(), data)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      scope(ids.client, (tx) =>
        tx.reviewDecision.create({
          data: {
            id: randomUUID(),
            versionId: row.id,
            reviewerId: ids.client,
            decision: "CHANGES_REQUESTED",
          },
        }),
      ),
    ).rejects.toThrow();
    const saved = await decide(row.assetId, data);
    await expect(
      scope(ids.client, (tx) =>
        tx.reviewDecision.update({
          where: { id: saved.id },
          data: { decision: "CHANGES_REQUESTED", note: "Edit" },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      scope(ids.owner, (tx) =>
        tx.reviewDecision.delete({ where: { id: saved.id } }),
      ),
    ).rejects.toThrow();
  });
  it("serializes reservations across uploaders, preserves READY bytes and refuses backwards publication", async () => {
    const first = await ready();
    const reserved = await Promise.all([
      prepare(first.assetId, ids.owner),
      prepare(first.assetId, ids.designer),
    ]);
    expect(new Set(reserved.map((v) => v.versionNumber)).size).toBe(2);
    const [older, newer] = reserved.sort(
      (a, b) => a.versionNumber - b.versionNumber,
    );
    const claim = await scope(newer.creatorId, (tx) =>
      claimUpload(tx, newer.creatorId, ids.workspace, projectId, newer.id),
    );
    await scope(newer.creatorId, (tx) =>
      publishUpload(
        tx,
        newer.creatorId,
        ids.workspace,
        projectId,
        newer.id,
        claim.token!,
        metadata,
      ),
    );
    const oldClaim = await scope(older.creatorId, (tx) =>
      claimUpload(tx, older.creatorId, ids.workspace, projectId, older.id),
    );
    await expect(
      scope(older.creatorId, (tx) =>
        publishUpload(
          tx,
          older.creatorId,
          ids.workspace,
          projectId,
          older.id,
          oldClaim.token!,
          metadata,
        ),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      scope(ids.owner, (tx) =>
        tx.asset.update({
          where: { id: first.assetId },
          data: { currentVersionId: first.id },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      scope(ids.owner, (tx) =>
        tx.assetVersion.update({
          where: { id: first.id },
          data: { width: 123 },
        }),
      ),
    ).rejects.toThrow();
    expect(
      (await db.assetVersion.findUniqueOrThrow({ where: { id: first.id } }))
        .objectKey,
    ).toBe(first.objectKey);
    await expect(prepare(first.assetId, ids.client)).rejects.toMatchObject({
      status: 403,
    });
    await expect(prepare(randomUUID())).rejects.toMatchObject({ status: 404 });
  });
  it("orders approval before a concurrent publish without carrying it into the new version", async () => {
    const first = await ready(),
      next = await prepare(first.assetId),
      claim = await scope(ids.designer, (tx) =>
        claimUpload(tx, ids.designer, ids.workspace, projectId, next.id),
      ),
      entered = gate(),
      release = gate();
    const approval = scope(ids.client, async (tx) => {
      const saved = await submitDecision(
        tx,
        ids.client,
        ids.workspace,
        projectId,
        first.assetId,
        input(first.id),
      );
      entered.resolve();
      await release.promise;
      return saved;
    });
    await entered.promise;
    expect(
      (
        await scope(
          ids.designer,
          (tx) =>
            tx.$queryRaw<
              { locked: boolean }[]
            >`SELECT pg_try_advisory_xact_lock(hashtextextended(${`project:${projectId}`},0)) AS locked`,
          other,
        )
      )[0].locked,
    ).toBe(false);
    const publication = scope(
      ids.designer,
      (tx) =>
        publishUpload(
          tx,
          ids.designer,
          ids.workspace,
          projectId,
          next.id,
          claim.token!,
          metadata,
        ),
      other,
    );
    release.resolve();
    await Promise.all([approval, publication]);
    expect((await decisions(first.assetId, first.id)).latest).toHaveLength(1);
    expect((await decisions(first.assetId, next.id)).latest).toEqual([]);
  });
  it("rejects an approval queued after publication, including direct RLS inserts that bypass the server advisory lock", async () => {
    const first = await ready(),
      next = await prepare(first.assetId),
      claim = await scope(ids.designer, (tx) =>
        claimUpload(tx, ids.designer, ids.workspace, projectId, next.id),
      ),
      entered = gate(),
      release = gate();
    const publication = scope(ids.designer, async (tx) => {
      await publishUpload(
        tx,
        ids.designer,
        ids.workspace,
        projectId,
        next.id,
        claim.token!,
        metadata,
      );
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    const stale = decide(
      first.assetId,
      input(first.id),
      ids.client,
      other,
    ).then(
      () => null,
      (e) => e,
    );
    const raw = scope(
      ids.client,
      (tx) =>
        tx.reviewDecision.create({
          data: {
            id: randomUUID(),
            versionId: first.id,
            reviewerId: ids.client,
            decision: "APPROVED",
          },
        }),
      other,
    ).then(
      () => null,
      (e) => e,
    );
    release.resolve();
    await publication;
    expect(await stale).toMatchObject({ status: 409 });
    expect(await raw).not.toBeNull();
    expect(
      await db.reviewDecision.count({ where: { versionId: first.id } }),
    ).toBe(0);
  });
  it("retains decisions in archived projects, blocks new feedback and paginates append-only history", async () => {
    const row = await ready();
    for (let n = 0; n < 22; n++)
      await decide(
        row.assetId,
        input(
          row.id,
          n % 2 ? "APPROVED" : "CHANGES_REQUESTED",
          n % 2 ? undefined : `Change ${n}`,
        ),
      );
    const a = await decisions(row.assetId, row.id),
      b = await scope(ids.client, (tx) =>
        decisionPage(
          tx,
          ids.client,
          ids.workspace,
          projectId,
          row.assetId,
          row.id,
          a.next!,
        ),
      );
    expect(a.history).toHaveLength(20);
    expect(b.history).toHaveLength(2);
    expect(a.latest).toHaveLength(1);
    expect(a.latest[0].decision).toBe("APPROVED");
    await db.project.update({
      where: { id: projectId },
      data: { archivedAt: new Date() },
    });
    await expect(decide(row.assetId, input(row.id))).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      scope(ids.client, (tx) =>
        tx.reviewDecision.create({
          data: {
            id: randomUUID(),
            versionId: row.id,
            reviewerId: ids.client,
            decision: "APPROVED",
          },
        }),
      ),
    ).rejects.toThrow();
    expect((await decisions(row.assetId, row.id)).history).toHaveLength(20);
  });
});
