import { randomUUID } from "node:crypto";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import sharp from "sharp";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { assertLocalDatabase } from "../../prisma/local-safety";
import {
  seedDevelopmentDatabase,
  fixtureIds as ids,
} from "../../prisma/seed-data";
import { withUserDatabase } from "../../src/lib/data/context";
import {
  claimUpload,
  publishUpload,
  readyAsset,
  listAssets,
} from "../../src/lib/data/uploads";
import { setProjectArchived } from "../../src/lib/data/projects";
import { uploadService } from "../../src/features/uploads/service";
import { cleanupUploads } from "../../src/features/uploads/cleanup";
import { validateImage } from "../../src/features/uploads/image";
import { UploadError } from "../../src/features/uploads/validation";
import type { UploadStorage } from "../../src/lib/storage/client";
const url = assertLocalDatabase(process.env.TEST_DATABASE_URL, "test");
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }, { schema: "app" }),
});
const second = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }, { schema: "app" }),
});
const projectId = randomUUID();
let bytes: Buffer;
const objects = new Map<string, Buffer>();
const storage: UploadStorage = {
  signUpload: vi.fn(
    async (key: string) => `https://storage.example.test/${key}`,
  ),
  read: vi.fn(async (key: string) => {
    const data = objects.get(key);
    if (!data) throw new UploadError("Missing upload.");
    return data;
  }),
  put: vi.fn(async (key: string, data: Buffer) => {
    if (objects.has(key)) throw new Error("Immutable object collision");
    objects.set(key, data);
  }),
  remove: vi.fn(async (keys: string[]) => {
    keys.forEach((key) => objects.delete(key));
  }),
  signRead: vi.fn(async (key: string) => `https://storage.example.test/${key}`),
};
const svc = (userId: string = ids.owner) =>
  uploadService(db, storage, userId, ids.workspace, projectId);
const file = () => ({
  name: "design.png",
  mimeType: "image/png",
  size: bytes.length,
});
async function staged(userId: string = ids.owner, data?: Buffer) {
  const prepared = await svc(userId).prepare(file());
  const row = await db.assetVersion.findUniqueOrThrow({
    where: { id: prepared.versionId },
  });
  objects.set(row.stagingKey, data || bytes);
  return row;
}
beforeAll(async () => {
  await seedDevelopmentDatabase(db);
  bytes = await sharp({
    create: { width: 40, height: 25, channels: 3, background: "#59734d" },
  })
    .png()
    .toBuffer();
  await db.project.create({
    data: {
      id: projectId,
      workspaceId: ids.workspace,
      name: "Upload test project",
    },
  });
  await db.projectMember.createMany({
    data: [ids.designer, ids.client].map((userId) => ({
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
  vi.clearAllMocks();
});
afterAll(async () => {
  await db.project.delete({ where: { id: projectId } });
  await db.$disconnect();
  await second.$disconnect();
});
describe("private upload lifecycle with real Postgres/RLS", () => {
  it("owner and assigned designer can reserve PENDING uploads with server-derived keys", async () => {
    for (const userId of [ids.owner, ids.designer]) {
      const p = await svc(userId).prepare({
        ...file(),
        workspaceId: ids.otherWorkspace,
        objectKey: "forged",
      });
      const row = await db.assetVersion.findUniqueOrThrow({
        where: { id: p.versionId },
      });
      expect(row).toMatchObject({
        status: "PENDING",
        workspaceId: ids.workspace,
        projectId,
        creatorId: userId,
      });
      expect(row.objectKey).toContain(
        `${ids.workspace}/${projectId}/${p.assetId}/${p.versionId}/`,
      );
      expect(
        (await db.asset.findUniqueOrThrow({ where: { id: p.assetId } }))
          .currentVersionId,
      ).toBeNull();
      expect(
        await withUserDatabase(db, ids.client, (tx) =>
          listAssets(tx, ids.client, ids.workspace, projectId),
        ),
      ).toMatchObject({ total: 0 });
    }
  });
  it("denies client, unassigned designer, outsider and mismatched workspace before privileged storage calls", async () => {
    for (const userId of [ids.client, ids.unassigned, ids.outsider])
      await expect(svc(userId).prepare(file())).rejects.toMatchObject({
        status: 403,
      });
    await expect(
      uploadService(
        db,
        storage,
        ids.owner,
        ids.otherWorkspace,
        projectId,
      ).prepare(file()),
    ).rejects.toMatchObject({ status: 403 });
    expect(storage.signUpload).not.toHaveBeenCalled();
    expect(storage.read).not.toHaveBeenCalled();
  });
  it("fully validates bytes, publishes once, and permits only assigned viewers", async () => {
    const row = await staged(ids.designer);
    const result = await svc(ids.designer).finalize(row.id);
    expect(result.assetId).toBe(row.assetId);
    expect(
      await db.assetVersion.findUniqueOrThrow({ where: { id: row.id } }),
    ).toMatchObject({
      status: "READY",
      width: 40,
      height: 25,
      fileSize: bytes.length,
    });
    expect(objects.has(row.stagingKey)).toBe(false);
    expect(objects.get(row.objectKey)).toEqual(bytes);
    for (const userId of [ids.owner, ids.designer, ids.client])
      expect(
        (
          await withUserDatabase(db, userId, (tx) =>
            readyAsset(tx, userId, ids.workspace, projectId, row.assetId),
          )
        ).id,
      ).toBe(row.assetId);
    for (const userId of [ids.unassigned, ids.outsider])
      await expect(
        withUserDatabase(db, userId, (tx) =>
          readyAsset(tx, userId, ids.workspace, projectId, row.assetId),
        ),
      ).rejects.toMatchObject({ status: 403 });
    expect(await svc(ids.designer).finalize(row.id)).toEqual(result);
    expect(storage.put).toHaveBeenCalledTimes(1);
  });
  it("rejects fake/corrupt bytes and missing staging files without a READY/current version", async () => {
    for (const value of [Buffer.from("not a real image"), null]) {
      const row = await staged();
      if (value) objects.set(row.stagingKey, value);
      else objects.delete(row.stagingKey);
      await expect(svc().finalize(row.id)).rejects.toThrow();
      expect(
        (await db.assetVersion.findUniqueOrThrow({ where: { id: row.id } }))
          .status,
      ).toBe("FAILED");
      expect(
        (await db.asset.findUniqueOrThrow({ where: { id: row.assetId } }))
          .currentVersionId,
      ).toBeNull();
      expect(objects.has(row.objectKey)).toBe(false);
    }
  });
  it("prevents client/direct writes, foreign current versions and non-READY pointers at RLS/constraint boundaries", async () => {
    const row = await staged();
    await expect(
      withUserDatabase(db, ids.client, (tx) =>
        tx.assetVersion.update({
          where: { id: row.id },
          data: { status: "READY" },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      withUserDatabase(db, ids.owner, (tx) =>
        tx.asset.update({
          where: { id: row.assetId },
          data: { currentVersionId: row.id },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      withUserDatabase(db, ids.client, (tx) =>
        tx.asset.create({
          data: {
            id: randomUUID(),
            workspaceId: ids.workspace,
            projectId,
            title: "Bypass",
          },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      withUserDatabase(db, ids.owner, (tx) =>
        tx.assetVersion.update({
          where: { id: row.id },
          data: { status: "READY" },
        }),
      ),
    ).rejects.toThrow();
    const other = await staged();
    await svc().finalize(other.id);
    await expect(
      withUserDatabase(db, ids.owner, (tx) =>
        tx.asset.update({
          where: { id: row.assetId },
          data: { currentVersionId: other.id },
        }),
      ),
    ).rejects.toThrow();
  });
  it("READY metadata is immutable, cancellation cannot delete a published image", async () => {
    const row = await staged();
    await svc().finalize(row.id);
    await expect(
      withUserDatabase(db, ids.owner, (tx) =>
        tx.assetVersion.update({ where: { id: row.id }, data: { width: 99 } }),
      ),
    ).rejects.toThrow();
    expect(await svc().cancel(row.id)).toMatchObject({ cancelled: false });
    expect(objects.has(row.objectKey)).toBe(true);
  });
  it("serializes concurrent finalization claims across independent clients", async () => {
    const row = await staged();
    const results = await Promise.allSettled([
      withUserDatabase(db, ids.owner, (tx) =>
        claimUpload(tx, ids.owner, ids.workspace, projectId, row.id),
      ),
      withUserDatabase(second, ids.owner, (tx) =>
        claimUpload(tx, ids.owner, ids.workspace, projectId, row.id),
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
  it("cancellation racing pixel validation cannot publish and later cleanup deletes a late upload replay", async () => {
    const row = await staged();
    const claimed = await withUserDatabase(db, ids.owner, (tx) =>
      claimUpload(tx, ids.owner, ids.workspace, projectId, row.id),
    );
    await svc().cancel(row.id);
    objects.set(row.stagingKey, bytes);
    objects.set(row.objectKey, bytes);
    await expect(
      withUserDatabase(db, ids.owner, (tx) =>
        publishUpload(
          tx,
          ids.owner,
          ids.workspace,
          projectId,
          row.id,
          claimed.token!,
          {
            width: 40,
            height: 25,
            mimeType: "image/png",
            fileSize: bytes.length,
            contentHash: "a".repeat(64),
          },
        ),
      ),
    ).rejects.toThrow();
    await db.assetVersion.update({
      where: { id: row.id },
      data: { cleanupAfter: new Date(0) },
    });
    await cleanupUploads(db, storage);
    expect(objects.has(row.stagingKey)).toBe(false);
    expect(objects.has(row.objectKey)).toBe(false);
  });
  it("rechecks archive and assignment revocation before publishing validated bytes", async () => {
    for (const mode of ["archive", "revoke"]) {
      if (mode === "revoke")
        await db.project.update({
          where: { id: projectId },
          data: { archivedAt: null },
        });
      const row = await staged(ids.designer);
      const claimed = await withUserDatabase(db, ids.designer, (tx) =>
        claimUpload(tx, ids.designer, ids.workspace, projectId, row.id),
      );
      if (mode === "archive")
        await withUserDatabase(db, ids.owner, (tx) =>
          setProjectArchived(tx, ids.owner, ids.workspace, projectId, true),
        );
      else
        await db.projectMember.delete({
          where: { projectId_userId: { projectId, userId: ids.designer } },
        });
      await expect(
        withUserDatabase(db, ids.designer, async (tx) =>
          publishUpload(
            tx,
            ids.designer,
            ids.workspace,
            projectId,
            row.id,
            claimed.token!,
            await validateImage(bytes, file()),
          ),
        ),
      ).rejects.toThrow();
      expect(
        (await db.asset.findUniqueOrThrow({ where: { id: row.assetId } }))
          .currentVersionId,
      ).toBeNull();
    }
    await db.projectMember.create({
      data: { projectId, workspaceId: ids.workspace, userId: ids.designer },
    });
  });
  it("expired uploads fail and abandoned objects are durably cleaned; READY final objects survive", async () => {
    const pending = await staged();
    await db.assetVersion.update({
      where: { id: pending.id },
      data: { expiresAt: new Date(0), cleanupAfter: new Date(0) },
    });
    await expect(svc().finalize(pending.id)).rejects.toMatchObject({
      status: 409,
    });
    const ready = await staged();
    await svc().finalize(ready.id);
    objects.set(ready.stagingKey, bytes);
    await db.assetVersion.update({
      where: { id: ready.id },
      data: { cleanedAt: null },
    });
    await cleanupUploads(db, storage, 100, new Date(Date.now() + 130 * 60_000));
    expect(
      (await db.assetVersion.findUniqueOrThrow({ where: { id: pending.id } }))
        .status,
    ).toBe("FAILED");
    expect(objects.has(pending.stagingKey)).toBe(false);
    expect(objects.has(ready.stagingKey)).toBe(false);
    expect(objects.has(ready.objectKey)).toBe(true);
  });
  it("failed storage cleanup remains queued and is retried safely", async () => {
    const row = await staged();
    await db.assetVersion.update({
      where: { id: row.id },
      data: { expiresAt: new Date(0), cleanupAfter: new Date(0) },
    });
    vi.mocked(storage.remove).mockRejectedValueOnce(
      new Error("temporary failure"),
    );
    await cleanupUploads(db, storage);
    expect(
      (await db.assetVersion.findUniqueOrThrow({ where: { id: row.id } }))
        .cleanedAt,
    ).toBeNull();
    await cleanupUploads(db, storage);
    expect(
      (await db.assetVersion.findUniqueOrThrow({ where: { id: row.id } }))
        .cleanedAt,
    ).not.toBeNull();
  });
  it("caps simultaneous pending reservations and rejects archived prepare before storage signing", async () => {
    for (let i = 0; i < 5; i++) await svc().prepare(file());
    await expect(svc().prepare(file())).rejects.toMatchObject({ status: 429 });
    await withUserDatabase(db, ids.owner, (tx) =>
      setProjectArchived(tx, ids.owner, ids.workspace, projectId, true),
    );
    await expect(svc().prepare(file())).rejects.toMatchObject({ status: 409 });
  });
});
