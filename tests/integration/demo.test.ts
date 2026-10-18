import { randomUUID, createHash } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { assertLocalDatabase } from "../../prisma/local-safety";
import {
  seedDevelopmentDatabase,
  fixtureIds as ids,
} from "../../prisma/seed-data";
import {
  newDemoIdentity,
  type DemoIdentity,
} from "../../src/features/demo/cookie";
import {
  createDemo,
  readDemo,
  mutateDemo,
  withDemoDatabase,
} from "../../src/lib/data/demo";
import { withUserDatabase } from "../../src/lib/data/context";
import { cleanupDemoSessions } from "../../src/features/demo/cleanup";
import { consumeCapabilityQuota } from "../../src/features/sharing/rate-limit";
const url = assertLocalDatabase(process.env.TEST_DATABASE_URL, "test"),
  db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }, { schema: "app" }),
  }),
  other = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }, { schema: "app" }),
  }),
  owned: DemoIdentity[] = [],
  rateKeys: string[] = [];
async function guest() {
  const { id, token } = newDemoIdentity(),
    identity = {
      id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expires: Date.now() + 86400000,
    };
  owned.push(identity);
  await withDemoDatabase(db, identity, (tx) => createDemo(tx, identity));
  return identity;
}
const read = (identity: DemoIdentity, client = db) =>
  withDemoDatabase(client, identity, (tx) => readDemo(tx, identity));
const change = (
  identity: DemoIdentity,
  payload: Record<string, unknown>,
  client = db,
) =>
  withDemoDatabase(client, identity, (tx) =>
    mutateDemo(tx, identity, {
      requestId: randomUUID(),
      generation: 0,
      ...payload,
    }),
  );
const comment = {
  operation: "comment",
  assetId: "identity",
  version: 2,
  body: "Only in this guest room.",
  xRatio: 0.25,
  yRatio: 0.75,
};
beforeAll(async () => {
  await seedDevelopmentDatabase(db);
});
afterAll(async () => {
  await db.demoSession.deleteMany({
    where: { id: { in: owned.map((g) => g.id) } },
  });
  await db.capabilityRateBucket.deleteMany({
    where: { keyHash: { in: rateKeys } },
  });
  await db.$disconnect();
  await other.$disconnect();
});
describe("expiring demo guests with production isolation", () => {
  it("keeps two guests separate and persists one guest across database clients", async () => {
    const a = await guest(),
      b = await guest(),
      requestId = randomUUID();
    const result = await Promise.all([
      change(a, { ...comment, requestId }),
      change(a, { ...comment, requestId }, other),
    ]);
    expect(result[0].commentCount).toBe(1);
    expect(result[1].commentCount).toBe(1);
    expect(
      (await read(a, other)).state.comments.some(
        (c) => c.body === comment.body,
      ),
    ).toBe(true);
    expect(
      (await read(b)).state.comments.some((c) => c.body === comment.body),
    ).toBe(false);
    expect(
      await withDemoDatabase(db, a, (tx) =>
        tx.demoSession.findMany({ where: { id: b.id } }),
      ),
    ).toEqual([]);
    expect(
      await withDemoDatabase(db, a, (tx) =>
        tx.demoSession.updateMany({
          where: { id: b.id },
          data: { view: "CLIENT", actionCount: { increment: 1 } },
        }),
      ),
    ).toEqual({ count: 0 });
  });
  it("validates Designer/Client on the server, rejects stale versions and cross-version parents", async () => {
    const a = await guest();
    await expect(
      change(a, {
        operation: "decision",
        assetId: "identity",
        version: 2,
        decision: "APPROVED",
      }),
    ).rejects.toMatchObject({ status: 403 });
    await change(a, { operation: "view", view: "CLIENT" });
    await change(a, {
      operation: "decision",
      assetId: "identity",
      version: 2,
      decision: "APPROVED",
    });
    await expect(
      change(a, {
        operation: "resolve",
        assetId: "identity",
        version: 2,
        id: "90000000-0000-4000-8000-000000000003",
        resolved: true,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(change(a, { ...comment, version: 1 })).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      change(a, {
        ...comment,
        parentId: "90000000-0000-4000-8000-000000000001",
        xRatio: null,
        yRatio: null,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      change(a, {
        operation: "decision",
        assetId: "identity",
        version: 2,
        decision: "CHANGES_REQUESTED",
      }),
    ).rejects.toMatchObject({ status: 400 });
    await change(a, { operation: "view", view: "DESIGNER" });
    expect(
      (
        await change(a, {
          operation: "resolve",
          assetId: "identity",
          version: 2,
          id: "90000000-0000-4000-8000-000000000003",
          resolved: true,
        })
      ).state.comments.find(
        (c) => c.id === "90000000-0000-4000-8000-000000000003",
      )?.resolved,
    ).toBe(true);
  });
  it("resets only its own content, preserves quotas/receipts, and rejects stale generation writes", async () => {
    const a = await guest(),
      b = await guest(),
      requestId = randomUUID();
    await change(a, comment);
    await change(b, comment);
    const first = await change(a, {
      operation: "reset",
      confirm: true,
      requestId,
    });
    const retry = await change(a, {
      operation: "reset",
      confirm: true,
      requestId,
    });
    expect(first.generation).toBe(1);
    expect(retry.generation).toBe(1);
    expect(retry.actionCount).toBe(2);
    expect(retry.commentCount).toBe(1);
    expect(retry.state.comments.some((c) => c.body === comment.body)).toBe(
      false,
    );
    expect(
      (await read(b)).state.comments.some((c) => c.body === comment.body),
    ).toBe(true);
    await expect(change(a, comment)).rejects.toMatchObject({ status: 409 });
  });
  it("enforces the lifetime 20-comment and 100-action caps even through resets", async () => {
    const a = await guest();
    for (let n = 0; n < 20; n++)
      await change(a, { ...comment, body: `Capped ${n}` });
    await expect(change(a, comment)).rejects.toMatchObject({ status: 429 });
    await change(a, { operation: "reset", confirm: true });
    await expect(
      change(a, { ...comment, generation: 1 }),
    ).rejects.toMatchObject({ status: 429 });
    const b = await guest();
    for (let n = 0; n < 100; n++)
      await change(b, {
        operation: "view",
        view: n % 2 ? "CLIENT" : "DESIGNER",
      });
    await expect(
      change(b, { operation: "reset", confirm: true }),
    ).rejects.toMatchObject({ status: 429 });
    await expect(
      withDemoDatabase(db, a, (tx) =>
        tx.demoSession.update({
          where: { id: a.id },
          data: { commentCount: 0, actionCount: 0 },
        }),
      ),
    ).rejects.toThrow();
  });
  it("cannot read or modify production tables or accept real workspace IDs", async () => {
    const a = await guest();
    for (const table of [
      '"Workspace"',
      '"Project"',
      '"Comment"',
      '"Membership"',
      '"ActivityEvent"',
    ])
      await expect(
        withDemoDatabase(db, a, (tx) =>
          tx.$queryRawUnsafe(`SELECT * FROM app.${table}`),
        ),
      ).rejects.toThrow();
    await expect(
      withUserDatabase(db, ids.owner, (tx) => tx.demoSession.findMany()),
    ).rejects.toThrow();
    await expect(
      change(a, { ...comment, assetId: ids.project }),
    ).rejects.toThrow();
    await expect(
      change(a, { ...comment, workspaceId: ids.workspace }),
    ).rejects.toThrow();
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
    await expect(read({ ...a, id: ids.workspace })).rejects.toMatchObject({
      status: 410,
    });
    await expect(
      read({ ...a, tokenHash: "a".repeat(64) }),
    ).rejects.toMatchObject({ status: 410 });
  });
  it("expires access and cleans only explicitly marked expired demo rows, idempotently", async () => {
    const expired = await guest(),
      active = await guest();
    await db.workspace.create({
      data: { id: expired.id, name: "Production-shaped cleanup guard" },
    });
    try {
      await db.demoSession.update({
        where: { id: expired.id },
        data: { expiresAt: new Date(0), actionCount: { increment: 1 } },
      });
      await expect(read(expired)).rejects.toMatchObject({ status: 410 });
      await expect(change(expired, comment)).rejects.toMatchObject({
        status: 410,
      });
      expect((await cleanupDemoSessions(db)).removed).toBeGreaterThanOrEqual(1);
      expect(
        await db.demoSession.findUnique({ where: { id: expired.id } }),
      ).toBeNull();
      expect(
        await db.demoSession.findUnique({ where: { id: active.id } }),
      ).not.toBeNull();
      expect(
        await db.workspace.findUnique({ where: { id: expired.id } }),
      ).not.toBeNull();
      expect((await cleanupDemoSessions(db)).removed).toBe(0);
      await expect(
        withDemoDatabase(db, active, (tx) =>
          tx.demoSession.delete({ where: { id: active.id } }),
        ),
      ).rejects.toThrow();
    } finally {
      await db.workspace.delete({ where: { id: expired.id } });
    }
  });
  it("durably limits fresh demo creation independently of other capability quotas", async () => {
    const network = createHash("sha256").update(randomUUID()).digest("hex"),
      before = await db.capabilityRateBucket.findMany({
        select: { keyHash: true },
      });
    for (let n = 0; n < 10; n++)
      await consumeCapabilityQuota(n % 2 ? db : other, network, "demo-start");
    const created = await db.capabilityRateBucket.findMany({
      where: { keyHash: { notIn: before.map((r) => r.keyHash) } },
    });
    rateKeys.push(...created.map((r) => r.keyHash));
    await expect(
      consumeCapabilityQuota(other, network, "demo-start"),
    ).rejects.toMatchObject({ status: 429 });
    expect(created[0].attempts).toBe(10);
    await consumeCapabilityQuota(db, network, "exchange");
    const extra = await db.capabilityRateBucket.findMany({
      where: {
        keyHash: { notIn: [...before.map((r) => r.keyHash), ...rateKeys] },
      },
    });
    rateKeys.push(...extra.map((r) => r.keyHash));
  });
});
