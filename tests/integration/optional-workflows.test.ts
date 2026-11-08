import { randomUUID, createHash } from "node:crypto";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { assertLocalDatabase } from "../../prisma/local-safety";
import {
  fixtureIds as ids,
  seedDevelopmentDatabase,
} from "../../prisma/seed-data";
import { withUserDatabase } from "../../src/lib/data/context";
import {
  createComment,
  addressFeedback,
  feedbackChecklist,
  reviewVersion,
} from "../../src/lib/data/comments";
import {
  changeAssetRemoval,
  removalDetails,
} from "../../src/lib/data/asset-removal";
import {
  requestPackage,
  packageStatus,
} from "../../src/lib/data/delivery-packages";
import { requestReview } from "../../src/lib/data/review-rounds";
import { submitDecision } from "../../src/lib/data/reviews";
import { changeCompletion } from "../../src/lib/data/completion";
import { createShare } from "../../src/lib/data/sharing";
vi.mock("server-only", () => ({}));
import { readFile } from "node:fs/promises";
import { maintainPackages } from "../../src/features/delivery/worker";
const original = Buffer.from("0123456789"),
  originalHash = createHash("sha256").update(original).digest("hex");
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
const project = randomUUID(),
  asset = randomUUID(),
  secondAsset = randomUUID(),
  first = randomUUID(),
  latest = randomUUID(),
  foreign = randomUUID(),
  sourceId = randomUUID(),
  completion = randomUUID();
const scope = <T>(
  actor: string,
  fn: Parameters<typeof withUserDatabase<T>>[2],
) => withUserDatabase(db, actor, fn);
const removal = (actor: string, restoring: boolean) =>
  scope(actor, (tx) =>
    changeAssetRemoval(tx, actor, ids.workspace, project, {
      assetId: asset,
      restoring,
      reason: "Superseded design",
    }),
  );
async function version(id: string, assetId: string, versionNumber: number) {
  await db.assetVersion.create({
    data: {
      id,
      assetId,
      projectId: project,
      workspaceId: ids.workspace,
      versionNumber,
      creatorId: ids.designer,
      originalName: "design.png",
      expectedMimeType: "image/png",
      expectedSize: 10,
      stagingKey: `fixture/${id}/staging`,
      objectKey: `fixture/${id}/original`,
      expiresAt: new Date(Date.now() + 600000),
      cleanupAfter: new Date(Date.now() + 7200000),
    },
  });
  await db.assetVersion.update({
    where: { id },
    data: {
      status: "READY",
      mimeType: "image/png",
      width: 20,
      height: 20,
      fileSize: 10,
      contentHash: originalHash,
    },
  });
  await db.asset.update({
    where: { id: assetId },
    data: { currentVersionId: id },
  });
}
beforeAll(async () => {
  await seedDevelopmentDatabase(db);
  await db.project.create({
    data: {
      id: project,
      workspaceId: ids.workspace,
      name: "Optional workflow fixture",
    },
  });
  await db.projectMember.createMany({
    data: [ids.designer, ids.client].map((userId) => ({
      projectId: project,
      workspaceId: ids.workspace,
      userId,
    })),
  });
  await db.asset.createMany({
    data: [asset, secondAsset].map((id) => ({
      id,
      projectId: project,
      workspaceId: ids.workspace,
      title: "Fixture design",
    })),
  });
  await version(first, asset, 1);
  await scope(ids.client, (tx) =>
    createComment(tx, ids.client, ids.workspace, project, asset, first, {
      id: sourceId,
      body: "Make the leaf smaller",
      xRatio: 0.4,
      yRatio: 0.6,
    }),
  );
  await version(latest, asset, 2);
  await version(foreign, secondAsset, 1);
});
afterAll(async () => {
  await db.project.updateMany({
    where: { id: project },
    data: { completionId: null },
  });
  await db.projectReopening.deleteMany({ where: { projectId: project } });
  await db.deliveryPackage.deleteMany({ where: { projectId: project } });
  await db.feedbackAddress.deleteMany({ where: { targetVersionId: latest } });
  await db.assetRemoval.deleteMany({ where: { assetId: asset } });
  await db.projectCompletion.deleteMany({ where: { projectId: project } });
  await db.project.deleteMany({ where: { id: project } });
  await db.$disconnect();
});
it("records idempotent revision claims without changing historical pins or granting approval", async () => {
  const input = { sourceId, note: "Reduced the leaf in version 2." };
  const add = () =>
    scope(ids.designer, (tx) =>
      addressFeedback(
        tx,
        ids.designer,
        ids.workspace,
        project,
        asset,
        latest,
        input,
      ),
    );
  const id = await add();
  expect(await add()).toBe(id);
  const page = await scope(ids.client, (tx) =>
    feedbackChecklist(tx, ids.client, ids.workspace, project, asset, latest),
  );
  expect(page.items[0].claim?.note).toBe(input.note);
  const root = await db.comment.findUniqueOrThrow({ where: { id: sourceId } });
  expect(root.resolvedAt).toBeNull();
  expect(root.body).toBe("Make the leaf smaller");
  expect(root.xRatio).toBe(0.4);
  await expect(
    scope(ids.client, (tx) =>
      addressFeedback(
        tx,
        ids.client,
        ids.workspace,
        project,
        asset,
        latest,
        input,
      ),
    ),
  ).rejects.toThrow();
  await expect(
    scope(ids.outsider, (tx) =>
      feedbackChecklist(
        tx,
        ids.outsider,
        ids.workspace,
        project,
        asset,
        latest,
      ),
    ),
  ).rejects.toThrow();
});
it("rejects cross-asset claims and direct restricted-role mutations", async () => {
  await expect(
    scope(ids.designer, (tx) =>
      addressFeedback(
        tx,
        ids.designer,
        ids.workspace,
        project,
        secondAsset,
        foreign,
        { sourceId, note: "Invalid scope" },
      ),
    ),
  ).rejects.toThrow();
  await expect(
    scope(ids.designer, (tx) =>
      tx.feedbackAddress.create({
        data: {
          sourceId,
          targetVersionId: foreign,
          actorId: ids.designer,
          actorName: "forged",
          note: "Invalid direct write",
        },
      }),
    ),
  ).rejects.toThrow();
  await expect(
    scope(ids.designer, (tx) =>
      tx.feedbackAddress.updateMany({ data: { note: "Rewrite history" } }),
    ),
  ).rejects.toThrow();
});
it("soft removal revokes sharing, hides direct reads, retains accounted originals and permits owner restore", async () => {
  await expect(removal(ids.designer, false)).rejects.toThrow();
  await scope(ids.owner, (tx) =>
    createShare(tx, ids.owner, ids.workspace, project, asset, latest),
  );
  const before = await scope(ids.owner, (tx) =>
    removalDetails(tx, ids.owner, ids.workspace, project, asset),
  );
  expect(before?.impact?.versions).toBe(2);
  await removal(ids.owner, false);
  await removal(ids.owner, false);
  expect(await db.assetRemoval.count({ where: { assetId: asset } })).toBe(1);
  expect(
    await db.assetVersion.count({ where: { assetId: asset, status: "READY" } }),
  ).toBe(2);
  await expect(
    scope(ids.client, (tx) =>
      reviewVersion(tx, ids.client, ids.workspace, project, asset, latest),
    ),
  ).rejects.toThrow();
  expect(
    await scope(ids.client, (tx) =>
      tx.assetVersion.count({ where: { assetId: asset } }),
    ),
  ).toBe(0);
  expect(
    await scope(ids.client, (tx) =>
      tx.comment.count({ where: { id: sourceId } }),
    ),
  ).toBe(0);
  expect(
    await db.shareLink.count({ where: { versionId: latest, revokedAt: null } }),
  ).toBe(0);
  await removal(ids.owner, true);
  await removal(ids.owner, true);
  expect(
    (
      await scope(ids.client, (tx) =>
        reviewVersion(tx, ids.client, ids.workspace, project, asset, latest),
      )
    ).version.id,
  ).toBe(latest);
  expect(
    await db.shareLink.count({ where: { versionId: latest, revokedAt: null } }),
  ).toBe(0);
});
it("retains historical approved downloads, denies expired restore and keeps tombstones private", async () => {
  await db.projectCompletion.create({
    data: {
      id: completion,
      projectId: project,
      workspaceId: ids.workspace,
      completedById: ids.owner,
      completedByName: "Fixture owner",
      manifest: {
        formatVersion: 1,
        projectName: "Fixture",
        files: [
          {
            assetId: asset,
            versionId: latest,
            fileSize: 10,
            contentHash: originalHash,
            originalName: "design.png",
          },
        ],
      },
    },
  });
  await removal(ids.owner, false);
  expect(
    await scope(ids.client, (tx) =>
      tx.assetVersion.count({ where: { id: latest } }),
    ),
  ).toBe(1);
  expect(
    await scope(ids.client, (tx) => tx.asset.count({ where: { id: asset } })),
  ).toBe(0);
  await expect(
    scope(ids.client, (tx) => tx.assetRemoval.findMany()),
  ).rejects.toThrow();
  await db.assetRemoval.updateMany({
    where: { assetId: asset, restoredAt: null },
    data: {
      removedAt: new Date(Date.now() - 32 * 86400000),
      restoreUntil: new Date(Date.now() - 2 * 86400000),
    },
  });
  await expect(removal(ids.owner, true)).rejects.toThrow("30-day");
});
it("packages are scoped, idempotent, bounded and cancellable without customer Storage writes", async () => {
  const request = (actor: string) =>
    scope(actor, (tx) =>
      requestPackage(tx, actor, ids.workspace, project, completion),
    );
  const firstJob = await request(ids.client);
  expect((await request(ids.client)).id).toBe(firstJob.id);
  await expect(request(ids.outsider)).rejects.toThrow();
  expect(
    await scope(ids.designer, (tx) =>
      tx.deliveryPackage.count({ where: { id: firstJob.id } }),
    ),
  ).toBe(0);
  await expect(
    scope(ids.client, (tx) =>
      tx.deliveryPackage.updateMany({ data: { status: "READY" } }),
    ),
  ).rejects.toThrow();
  await scope(ids.client, (tx) =>
    requestPackage(tx, ids.client, ids.workspace, project, completion, true),
  );
  expect(
    (
      await scope(ids.client, (tx) =>
        packageStatus(tx, ids.client, ids.workspace, project, completion),
      )
    )?.status,
  ).toBe("CANCELLED");
  await expect(request(ids.client)).rejects.toThrow("cleanup");
  const oversized = randomUUID();
  await db.projectCompletion.create({
    data: {
      id: oversized,
      projectId: project,
      workspaceId: ids.workspace,
      completedById: ids.owner,
      completedByName: "Fixture",
      manifest: {
        formatVersion: 1,
        files: Array.from({ length: 21 }, () => ({ fileSize: 1 })),
      },
    },
  });
  await expect(
    scope(ids.client, (tx) =>
      requestPackage(tx, ids.client, ids.workspace, project, oversized),
    ),
  ).rejects.toThrow("20 files");
});

it("builds an actual bounded archive with synthetic storage, and retries failed artifact cleanup without deleting originals", async () => {
  const objects = new Map<string, Buffer>();
  let deleteFails = false;
  const dependencies = {
    enabled: true,
    storage: {
      verify: async () => 105000000,
      put: async (key: string, path: string) => {
        objects.set(key, await readFile(path));
      },
      remove: async (key: string) => {
        if (deleteFails) throw new Error("Injected storage failure");
        objects.delete(key);
      },
      sign: async () => "https://example.invalid/synthetic-only",
    },
    originals: { read: async () => Buffer.from(original) },
  };
  expect((await maintainPackages(db, false, dependencies)).cleaned).toBe(1);
  await scope(ids.client, (tx) =>
    requestPackage(tx, ids.client, ids.workspace, project, completion),
  );
  expect((await maintainPackages(db, true, dependencies)).generated).toBe(1);
  const job = await scope(ids.client, (tx) =>
    packageStatus(tx, ids.client, ids.workspace, project, completion),
  );
  expect(job?.status).toBe("READY");
  expect(objects.size).toBe(1);
  const bytes = [...objects.values()][0];
  expect(bytes.readUInt32LE(0)).toBe(0x04034b50);
  expect(job?.artifactHash).toBe(
    createHash("sha256").update(bytes).digest("hex"),
  );
  await scope(ids.client, (tx) =>
    requestPackage(tx, ids.client, ids.workspace, project, completion, true),
  );
  deleteFails = true;
  expect((await maintainPackages(db, false, dependencies)).failed).toBe(1);
  expect(
    await db.deliveryPackage.count({ where: { id: job!.id, cleanedAt: null } }),
  ).toBe(1);
  expect(objects.size).toBe(1);
  deleteFails = false;
  await db.deliveryPackage.update({
    where: { id: job!.id },
    data: { leaseUntil: new Date(0) },
  });
  expect((await maintainPackages(db, false, dependencies)).cleaned).toBe(1);
  expect(objects.size).toBe(0);
  expect(
    await db.assetVersion.count({ where: { assetId: asset, status: "READY" } }),
  ).toBe(2);
});

it("completion excludes removed designs and restoration remains blocked until reopening", async () => {
  await scope(ids.owner, (tx) =>
    requestReview(tx, ids.owner, ids.workspace, project, secondAsset, {
      versionId: foreign,
      id: randomUUID(),
      reviewerIds: [ids.client],
      reason: "Approve the remaining visible design",
    }),
  );
  await scope(ids.client, (tx) =>
    submitDecision(tx, ids.client, ids.workspace, project, secondAsset, {
      id: randomUUID(),
      expectedCurrentVersionId: foreign,
      decision: "APPROVED",
      note: "Approved remaining work",
    }),
  );
  const id = randomUUID();
  await scope(ids.owner, (tx) =>
    changeCompletion(tx, ids.owner, ids.workspace, project, {
      id,
      operation: "complete",
    }),
  );
  const row = await db.projectCompletion.findUniqueOrThrow({ where: { id } });
  expect(
    (row.manifest as { files: { assetId: string }[] }).files.map(
      (f) => f.assetId,
    ),
  ).toEqual([secondAsset]);
  await expect(removal(ids.owner, true)).rejects.toThrow("Reopen");
  await scope(ids.owner, (tx) =>
    changeCompletion(tx, ids.owner, ids.workspace, project, {
      id: randomUUID(),
      operation: "reopen",
      reason: "Continue fixture checks",
    }),
  );
});
