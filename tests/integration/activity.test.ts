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
import {
  prepareUpload,
  claimUpload,
  publishUpload,
} from "../../src/lib/data/uploads";
import { createComment, resolveComment } from "../../src/lib/data/comments";
import { submitDecision } from "../../src/lib/data/reviews";
import {
  createInvitation,
  acceptInvitation,
  withCapabilityDatabase,
} from "../../src/lib/data/sharing";
import { activityPage, markActivityRead } from "../../src/lib/data/activity";
const url = assertLocalDatabase(process.env.TEST_DATABASE_URL, "test"),
  db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }, { schema: "app" }),
  }),
  other = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }, { schema: "app" }),
  });
const projectId = randomUUID(),
  secondProject = randomUUID(),
  recipient = randomUUID();
const scope = <T>(
  user: string,
  fn: Parameters<typeof withUserDatabase<T>>[2],
  client = db,
) => withUserDatabase(client, user, fn);
const metadata = {
  width: 400,
  height: 200,
  mimeType: "image/png",
  fileSize: 10,
  contentHash: "a".repeat(64),
};
async function staged(project = projectId) {
  const row = await scope(ids.owner, (tx) =>
    prepareUpload(tx, ids.owner, ids.workspace, project, {
      name: "activity.png",
      mimeType: "image/png",
      size: 10,
    }),
  );
  const claimed = await scope(ids.owner, (tx) =>
    claimUpload(tx, ids.owner, ids.workspace, project, row.id),
  );
  return { row, token: claimed.token! };
}
async function ready(project = projectId) {
  const { row, token } = await staged(project);
  await scope(ids.owner, (tx) =>
    publishUpload(
      tx,
      ids.owner,
      ids.workspace,
      project,
      row.id,
      token,
      metadata,
    ),
  );
  return row;
}
const feedback = (row: { assetId: string; id: string }, input: unknown) =>
  scope(ids.client, (tx) =>
    createComment(
      tx,
      ids.client,
      ids.workspace,
      projectId,
      row.assetId,
      row.id,
      input,
    ),
  );
const page = (user: string = ids.client, before?: string, client = db) =>
  scope(
    user,
    (tx) => activityPage(tx, user, ids.workspace, projectId, before),
    client,
  );
const mark = (through: string, user: string = ids.client, client = db) =>
  scope(
    user,
    (tx) => markActivityRead(tx, user, ids.workspace, projectId, through),
    client,
  );
beforeAll(async () => {
  await seedDevelopmentDatabase(db);
  await db.userProfile.create({
    data: { id: recipient, displayName: "Invited teammate" },
  });
  for (const id of [projectId, secondProject])
    await db.project.create({
      data: { id, workspaceId: ids.workspace, name: "Activity integration" },
    });
  await db.projectMember.createMany({
    data: [ids.client, ids.designer].map((userId) => ({
      projectId,
      workspaceId: ids.workspace,
      userId,
    })),
  });
});
afterAll(async () => {
  await db.project.deleteMany({
    where: { id: { in: [projectId, secondProject] } },
  });
  await db.membership.deleteMany({
    where: { workspaceId: ids.workspace, userId: recipient },
  });
  await db.userProfile.delete({ where: { id: recipient } });
  await db.$disconnect();
  await other.$disconnect();
});
describe("transactional project activity and persistent unread state", () => {
  it("records upload, root/reply, resolve/reopen and decisions once per successful change", async () => {
    const { row, token } = await staged();
    await scope(ids.owner, (tx) =>
      publishUpload(
        tx,
        ids.owner,
        ids.workspace,
        projectId,
        row.id,
        token,
        metadata,
      ),
    );
    await scope(ids.owner, (tx) =>
      publishUpload(
        tx,
        ids.owner,
        ids.workspace,
        projectId,
        row.id,
        token,
        metadata,
      ),
    );
    const input = {
      id: randomUUID(),
      body: "private text MUST_NOT_COPY",
      xRatio: 0.2,
      yRatio: 0.4,
    };
    const root = await feedback(row, input);
    await feedback(row, input);
    const reply = {
      id: randomUUID(),
      body: "sensitive reply",
      parentId: root.id,
    };
    await feedback(row, reply);
    await feedback(row, reply);
    for (const resolved of [true, true, false, false])
      await scope(ids.designer, (tx) =>
        resolveComment(
          tx,
          ids.designer,
          ids.workspace,
          projectId,
          row.assetId,
          row.id,
          root.id,
          resolved,
        ),
      );
    const decision = {
      id: randomUUID(),
      expectedCurrentVersionId: row.id,
      decision: "APPROVED",
    };
    await scope(ids.client, (tx) =>
      submitDecision(
        tx,
        ids.client,
        ids.workspace,
        projectId,
        row.assetId,
        decision,
      ),
    );
    await scope(ids.client, (tx) =>
      submitDecision(
        tx,
        ids.client,
        ids.workspace,
        projectId,
        row.assetId,
        decision,
      ),
    );
    await scope(ids.client, (tx) =>
      submitDecision(tx, ids.client, ids.workspace, projectId, row.assetId, {
        ...decision,
        id: randomUUID(),
        decision: "CHANGES_REQUESTED",
        note: "private note",
      }),
    );
    const events = await db.activityEvent.findMany({
      where: { projectId, assetId: row.assetId },
      orderBy: { id: "asc" },
    });
    expect(events.map((e) => e.kind)).toEqual([
      "UPLOAD_READY",
      "COMMENT_CREATED",
      "REPLY_CREATED",
      "THREAD_RESOLVED",
      "THREAD_REOPENED",
      "REVIEW_APPROVED",
      "CHANGES_REQUESTED",
    ]);
    expect(events.find((e) => e.kind === "THREAD_RESOLVED")?.actorName).toBe(
      "Sample designer",
    );
    expect(events.find((e) => e.kind === "REPLY_CREATED")?.threadNumber).toBe(
      1,
    );
    expect(events.map((e) => e.sourceKey).join()).not.toContain(
      "MUST_NOT_COPY",
    );
    expect(events[0]).not.toHaveProperty("body");
    expect(events[0]).not.toHaveProperty("token");
  });
  it("rolls back the business write and its event together, and records no failed decisions", async () => {
    const { row, token } = await staged();
    await expect(
      scope(ids.owner, async (tx) => {
        await publishUpload(
          tx,
          ids.owner,
          ids.workspace,
          projectId,
          row.id,
          token,
          metadata,
        );
        throw new Error("rollback proof");
      }),
    ).rejects.toThrow("rollback proof");
    expect(await db.activityEvent.count({ where: { versionId: row.id } })).toBe(
      0,
    );
    expect(
      (await db.assetVersion.findUniqueOrThrow({ where: { id: row.id } }))
        .status,
    ).toBe("PENDING");
    const published = await ready();
    const before = await db.activityEvent.count({ where: { projectId } });
    await expect(
      scope(ids.designer, (tx) =>
        submitDecision(
          tx,
          ids.designer,
          ids.workspace,
          projectId,
          published.assetId,
          {
            id: randomUUID(),
            expectedCurrentVersionId: published.id,
            decision: "APPROVED",
          },
        ),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(await db.activityEvent.count({ where: { projectId } })).toBe(before);
    await db.assetVersion.update({
      where: { id: row.id },
      data: { status: "FAILED" },
    });
  });
  it("records invite acceptance atomically and does not copy its email/token or duplicate retries", async () => {
    const invite = await scope(ids.owner, (tx) =>
      createInvitation(tx, ids.owner, ids.workspace, projectId, {
        email: "invite-activity@example.test",
        role: "CLIENT",
      }),
    );
    await Promise.all(
      [db, other].map((client) =>
        scope(
          recipient,
          (tx) =>
            acceptInvitation(tx, invite.token, {
              email: "invite-activity@example.test",
              emailVerified: true,
            }),
          client,
        ),
      ),
    );
    const events = await db.activityEvent.findMany({
      where: { projectId, kind: "INVITE_ACCEPTED" },
    });
    expect(events).toHaveLength(1);
    expect(events[0].actorName).toBe("Invited teammate");
    expect(
      JSON.stringify(events, (_, v) =>
        typeof v === "bigint" ? v.toString() : v,
      ),
    ).not.toContain(invite.token);
    expect(events[0]).not.toHaveProperty("email");
  });
  it("persists per-user read markers, handles stale mark retries and leaves concurrently added events unread", async () => {
    const initial = await page();
    expect(initial.unreadCount).toBeGreaterThan(0);
    const row = await ready();
    const newer = await page();
    expect(BigInt(newer.headId)).toBeGreaterThan(BigInt(initial.headId));
    const marked = await mark(initial.headId);
    expect(marked.unreadCount).toBe(1);
    expect((await page(ids.client, undefined, other)).unreadCount).toBe(1);
    expect((await page(ids.designer)).unreadCount).toBeGreaterThan(1);
    await Promise.all([
      mark(newer.headId),
      mark(initial.headId, ids.client, other),
    ]);
    const result = await page();
    expect(result.unreadCount).toBe(0);
    expect(result.lastReadAt).not.toBeNull();
    expect((await mark("0")).unreadCount).toBe(0);
    await feedback(row, {
      id: randomUUID(),
      body: "A new unseen comment",
      xRatio: 0.1,
      yRatio: 0.2,
    });
    expect((await page()).unreadCount).toBe(1);
  });
  it("rejects outsiders, unassigned users, another project's cursor and forged read/event writes under RLS", async () => {
    const second = await ready(secondProject);
    const event = await db.activityEvent.findFirstOrThrow({
      where: { projectId: secondProject },
    });
    for (const actor of [ids.unassigned, ids.outsider]) {
      await expect(page(actor)).rejects.toMatchObject({ status: 403 });
      expect(
        await scope(actor, (tx) =>
          tx.activityEvent.findMany({ where: { projectId } }),
        ),
      ).toEqual([]);
      await expect(mark("0", actor)).rejects.toMatchObject({ status: 403 });
    }
    await expect(page(ids.client, event.id.toString())).rejects.toMatchObject({
      status: 404,
    });
    await expect(mark(event.id.toString())).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      scope(ids.client, (tx) =>
        tx.projectActivityRead.create({
          data: {
            projectId,
            workspaceId: ids.workspace,
            userId: ids.designer,
            lastReadEventId: BigInt("0"),
            lastReadAt: new Date(),
          },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      scope(ids.client, (tx) =>
        tx.projectActivityRead.update({
          where: { projectId_userId: { projectId, userId: ids.client } },
          data: { lastReadEventId: event.id },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      scope(ids.owner, (tx) =>
        tx.activityEvent.create({
          data: {
            projectId,
            workspaceId: ids.workspace,
            sourceKey: randomUUID(),
            kind: "UPLOAD_READY",
            actorName: "Forged",
          },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      withCapabilityDatabase(db, (tx) => tx.activityEvent.findMany()),
    ).rejects.toThrow();
    expect(second.projectId).toBe(secondProject);
  });
  it("paginates in stable order with no duplicates while new events arrive", async () => {
    const row = await ready();
    for (let n = 0; n < 23; n++)
      await feedback(row, {
        id: randomUUID(),
        body: `pagination ${n}`,
        xRatio: 0.1,
        yRatio: 0.1,
      });
    const first = await page();
    expect(first.items).toHaveLength(20);
    expect(first.next).not.toBeNull();
    await feedback(row, {
      id: randomUUID(),
      body: "newer than first page",
      xRatio: 0.2,
      yRatio: 0.2,
    });
    const next = await page(ids.client, first.next!);
    expect(new Set([...first.items, ...next.items].map((i) => i.id)).size).toBe(
      first.items.length + next.items.length,
    );
    expect(next.items.every((i) => BigInt(i.id) < BigInt(first.next!))).toBe(
      true,
    );
  });
  it("keeps archived activity readable and enforces revocation on both feed and read-marker writes", async () => {
    await db.project.update({
      where: { id: projectId },
      data: { archivedAt: new Date() },
    });
    const initial = await page();
    expect(initial.items.length).toBeGreaterThan(0);
    expect((await mark(initial.headId)).unreadCount).toBe(0);
    await db.projectMember.delete({
      where: { projectId_userId: { projectId, userId: ids.client } },
    });
    await expect(page()).rejects.toMatchObject({ status: 403 });
    await expect(mark(initial.headId)).rejects.toMatchObject({ status: 403 });
    expect(
      await scope(ids.client, (tx) =>
        tx.projectActivityRead.findMany({ where: { projectId } }),
      ),
    ).toEqual([]);
  });
});
