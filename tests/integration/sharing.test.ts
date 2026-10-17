import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, it, expect, describe } from "vitest";
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
import { createComment } from "../../src/lib/data/comments";
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
  acceptInvitation,
  inspectInvitation,
  createShare,
  revokeShare,
  readShare,
  exchangeShare,
  sharedComments,
  withCapabilityDatabase,
} from "../../src/lib/data/sharing";
import { hashToken, makeToken } from "../../src/features/sharing/tokens";
import { consumeCapabilityQuota } from "../../src/features/sharing/rate-limit";
import type { ThreadPage } from "../../src/features/comments/types";
const url = assertLocalDatabase(process.env.TEST_DATABASE_URL, "test");
const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }, { schema: "app" }),
  }),
  other = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }, { schema: "app" }),
  });
const projectId = randomUUID(),
  secondProject = randomUUID(),
  recipient = randomUUID(),
  differentUser = randomUUID(),
  networkHash = "f".repeat(64);
const user = <T>(
  id: string,
  fn: Parameters<typeof withUserDatabase<T>>[2],
  client = db,
) => withUserDatabase(client, id, fn);
const cap = <T>(fn: Parameters<typeof withCapabilityDatabase<T>>[1]) =>
  withCapabilityDatabase(db, fn);
const invite = (
  email = "person@example.test",
  role: "CLIENT" | "DESIGNER" = "CLIENT",
) =>
  user(ids.owner, (tx) =>
    createInvitation(tx, ids.owner, ids.workspace, projectId, { email, role }),
  );
const accept = (
  token: string,
  id = recipient,
  email = "person@example.test",
  emailVerified = true,
  client = db,
) =>
  user(
    id,
    (tx) => acceptInvitation(tx, token, { email, emailVerified }),
    client,
  );
let assetId: string, versionId: string, rootId: string, otherVersion: string;
beforeAll(async () => {
  await seedDevelopmentDatabase(db);
  await db.userProfile.createMany({
    data: [
      { id: recipient, displayName: "Invited person" },
      { id: differentUser, displayName: "Different identity" },
    ],
  });
  for (const id of [projectId, secondProject])
    await db.project.create({
      data: { id, workspaceId: ids.workspace, name: "Capability tests" },
    });
  for (let n = 0; n < 2; n++) {
    const row = await user(ids.owner, (tx) =>
      prepareUpload(tx, ids.owner, ids.workspace, projectId, {
        name: "fixture.png",
        mimeType: "image/png",
        size: 10,
      }),
    );
    const claimed = await user(ids.owner, (tx) =>
      claimUpload(tx, ids.owner, ids.workspace, projectId, row.id),
    );
    await user(ids.owner, (tx) =>
      publishUpload(
        tx,
        ids.owner,
        ids.workspace,
        projectId,
        row.id,
        claimed.token!,
        {
          width: 400,
          height: 200,
          mimeType: "image/png",
          fileSize: 10,
          contentHash: "a".repeat(64),
        },
      ),
    );
    if (n === 0) {
      assetId = row.assetId;
      versionId = row.id;
    } else otherVersion = row.id;
  }
  rootId = (
    await user(ids.owner, (tx) =>
      createComment(
        tx,
        ids.owner,
        ids.workspace,
        projectId,
        assetId,
        versionId,
        {
          id: randomUUID(),
          body: "Shared plain <b>feedback</b>",
          xRatio: 0.2,
          yRatio: 0.8,
        },
      ),
    )
  ).id;
  for (let n = 0; n < 7; n++)
    await user(ids.owner, (tx) =>
      createComment(
        tx,
        ids.owner,
        ids.workspace,
        projectId,
        assetId,
        versionId,
        { id: randomUUID(), body: `reply ${n}`, parentId: rootId },
      ),
    );
});
afterAll(async () => {
  await db.project.deleteMany({
    where: { id: { in: [projectId, secondProject] } },
  });
  await db.membership.deleteMany({
    where: { userId: { in: [recipient, differentUser] } },
  });
  await db.userProfile.deleteMany({
    where: { id: { in: [recipient, differentUser] } },
  });
  await db.capabilityRateBucket.deleteMany({
    where: { keyHash: { in: rateKeys } },
  });
  await db.$disconnect();
  await other.$disconnect();
});
const rateKeys: string[] = [];
describe("project invitations and version-only read capabilities", () => {
  it("stores only hashes, rejects wrong/unconfirmed email, atomically accepts twice without role escalation", async () => {
    const link = await invite();
    const stored = await db.projectInvitation.findUniqueOrThrow({
      where: { id: link.id },
    });
    expect(stored.tokenHash).toBe(hashToken(link.token));
    expect(JSON.stringify(stored)).not.toContain(link.token);
    expect(stored.expiresAt.getTime() - Date.now()).toBeGreaterThan(
      6.9 * 86400000,
    );
    expect((await cap((tx) => inspectInvitation(tx, link.token))).role).toBe(
      "CLIENT",
    );
    await expect(
      accept(link.token, recipient, "wrong@example.test"),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      accept(link.token, recipient, "person@example.test", false),
    ).rejects.toMatchObject({ status: 403 });
    const unverified = await user(
      recipient,
      (tx) =>
        tx.$queryRaw<
          { value: { status: number } }[]
        >`SELECT app.accept_invitation(${hashToken(link.token)},'person@example.test',NULL) AS value`,
    );
    expect(unverified[0].value.status).toBe(403);
    const result = await Promise.all([
      accept(link.token),
      accept(link.token, recipient, "PERSON@example.test", true, other),
    ]);
    expect(result[0]).toEqual(result[1]);
    expect(result[0].projectId).toBe(projectId);
    expect(
      (
        await db.membership.findUniqueOrThrow({
          where: {
            workspaceId_userId: {
              workspaceId: ids.workspace,
              userId: recipient,
            },
          },
        })
      ).role,
    ).toBe("CLIENT");
    expect(
      await db.projectMember.count({ where: { projectId, userId: recipient } }),
    ).toBe(1);
    await expect(accept(link.token, differentUser)).rejects.toMatchObject({
      status: 409,
    });
    await user(ids.owner, (tx) =>
      tx.projectMember.delete({
        where: { projectId_userId: { projectId, userId: recipient } },
      }),
    );
    await accept(link.token);
    expect(
      await db.projectMember.count({ where: { projectId, userId: recipient } }),
    ).toBe(0);
  });
  it("rejects expired/revoked links, conflicting roles and OWNER role forgery without partial membership", async () => {
    const expired = await invite();
    await db.projectInvitation.update({
      where: { id: expired.id },
      data: { expiresAt: new Date(0) },
    });
    await expect(accept(expired.token)).rejects.toMatchObject({ status: 410 });
    await expect(
      cap((tx) => inspectInvitation(tx, expired.token)),
    ).rejects.toMatchObject({ status: 410 });
    const revoked = await invite();
    await user(ids.owner, (tx) =>
      revokeInvitation(tx, ids.owner, ids.workspace, projectId, revoked.id),
    );
    await expect(accept(revoked.token)).rejects.toMatchObject({ status: 410 });
    const conflict = await invite("person@example.test", "DESIGNER");
    await expect(accept(conflict.token)).rejects.toMatchObject({ status: 409 });
    expect(
      await db.projectMember.count({ where: { projectId, userId: recipient } }),
    ).toBe(0);
    await expect(
      user(ids.owner, (tx) =>
        createInvitation(tx, ids.owner, ids.workspace, projectId, {
          email: "person@example.test",
          role: "OWNER",
        }),
      ),
    ).rejects.toThrow();
    await expect(
      user(ids.owner, (tx) =>
        tx.projectInvitation.create({
          data: {
            projectId,
            workspaceId: ids.workspace,
            email: "x@example.test",
            role: "OWNER",
            tokenHash: hashToken(makeToken()),
            expiresAt: new Date(Date.now() + 60000),
          },
        }),
      ),
    ).rejects.toThrow();
  });
  it("limits creation/list/revoke to owners and rejects forged resource scope", async () => {
    for (const actor of [ids.client, ids.designer, ids.outsider])
      await expect(
        user(actor, (tx) =>
          createInvitation(tx, actor, ids.workspace, projectId, {
            email: "new@example.test",
            role: "CLIENT",
          }),
        ),
      ).rejects.toMatchObject({ status: 403 });
    expect(
      await user(ids.client, (tx) =>
        tx.projectInvitation.findMany({ where: { projectId } }),
      ),
    ).toEqual([]);
    const link = await invite();
    await expect(
      user(ids.owner, (tx) =>
        revokeInvitation(tx, ids.owner, ids.workspace, secondProject, link.id),
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      (
        await user(ids.owner, (tx) =>
          listInvitations(tx, ids.owner, ids.workspace, projectId),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it("grants only one version and paginates its read-only comments/replies without table access", async () => {
    const link = await user(ids.owner, (tx) =>
      createShare(tx, ids.owner, ids.workspace, projectId, assetId, versionId),
    );
    expect((await cap((tx) => exchangeShare(tx, link.token))).id).toBe(link.id);
    const view = await cap((tx) => readShare(tx, link.id, link.token));
    expect(view.versionId).toBe(versionId);
    expect(view.width).toBe(400);
    const page = await cap((tx) =>
      sharedComments<ThreadPage>(tx, link.id, link.token),
    );
    expect(page.threads[0].id).toBe(rootId);
    expect(page.threads[0].body).toContain("<b>");
    expect(page.threads[0].authorId).toBe("");
    expect(page.threads[0].replies).toHaveLength(5);
    expect(page.threads[0].moreReplies).toBe(true);
    const tail = await cap((tx) =>
      sharedComments<{ replies: unknown[] }>(
        tx,
        link.id,
        link.token,
        0,
        rootId,
        page.threads[0].replyCursor!,
      ),
    );
    expect(tail.replies).toHaveLength(2);
    await expect(
      cap((tx) => readShare(tx, randomUUID(), link.token)),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      cap((tx) => sharedComments(tx, link.id, link.token, 0, randomUUID())),
    ).rejects.toMatchObject({ status: 404 });
    for (const table of [
      '"AssetVersion"',
      '"Comment"',
      '"Project"',
      '"ShareLink"',
      '"ProjectInvitation"',
    ])
      await expect(
        cap((tx) => tx.$queryRawUnsafe(`SELECT * FROM app.${table}`)),
      ).rejects.toThrow();
    await expect(
      cap(
        (tx) =>
          tx.$queryRaw`SELECT app.accept_invitation(${hashToken(link.token)},'person@example.test',true)`,
      ),
    ).rejects.toThrow();
    await expect(
      user(ids.owner, (tx) =>
        createShare(
          tx,
          ids.owner,
          ids.workspace,
          projectId,
          assetId,
          otherVersion,
        ),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("revocation/expiry stop new reads and file capabilities, including a historical version", async () => {
    const link = await user(ids.owner, (tx) =>
      createShare(tx, ids.owner, ids.workspace, projectId, assetId, versionId),
    );
    const pending = await user(ids.owner, (tx) =>
      prepareUpload(tx, ids.owner, ids.workspace, projectId, {
        assetId,
        name: "v2.png",
        mimeType: "image/png",
        size: 10,
      }),
    );
    const claimed = await user(ids.owner, (tx) =>
      claimUpload(tx, ids.owner, ids.workspace, projectId, pending.id),
    );
    await user(ids.owner, (tx) =>
      publishUpload(
        tx,
        ids.owner,
        ids.workspace,
        projectId,
        pending.id,
        claimed.token!,
        {
          width: 200,
          height: 400,
          mimeType: "image/png",
          fileSize: 10,
          contentHash: "b".repeat(64),
        },
      ),
    );
    expect(
      (await cap((tx) => readShare(tx, link.id, link.token))).versionId,
    ).toBe(versionId);
    await user(ids.owner, (tx) =>
      revokeShare(
        tx,
        ids.owner,
        ids.workspace,
        projectId,
        assetId,
        versionId,
        link.id,
      ),
    );
    await expect(
      cap((tx) => readShare(tx, link.id, link.token)),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      cap((tx) => exchangeShare(tx, link.token)),
    ).rejects.toMatchObject({ status: 404 });
    const expired = await user(ids.owner, (tx) =>
      createShare(tx, ids.owner, ids.workspace, projectId, assetId, versionId),
    );
    await db.shareLink.update({
      where: { id: expired.id },
      data: { expiresAt: new Date(0) },
    });
    await expect(
      cap((tx) => readShare(tx, expired.id, expired.token)),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      user(ids.designer, (tx) =>
        createShare(
          tx,
          ids.designer,
          ids.workspace,
          projectId,
          assetId,
          versionId,
        ),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("uses a durable hashed quota that cannot be reset by another database client", async () => {
    const original = await db.capabilityRateBucket.findMany({
      select: { keyHash: true },
    });
    for (let n = 0; n < 40; n++)
      await consumeCapabilityQuota(n % 2 ? db : other, networkHash, "exchange");
    await expect(
      consumeCapabilityQuota(other, networkHash, "exchange"),
    ).rejects.toMatchObject({ status: 429 });
    const records = await db.capabilityRateBucket.findMany({
      where: { keyHash: { notIn: original.map((r) => r.keyHash) } },
    });
    rateKeys.push(...records.map((r) => r.keyHash));
    expect(records).toHaveLength(1);
    expect(records[0].attempts).toBe(40);
    expect(records[0].keyHash).not.toBe(networkHash);
    await db.capabilityRateBucket.update({
      where: { keyHash: records[0].keyHash },
      data: { expiresAt: new Date(0) },
    });
    await consumeCapabilityQuota(db, networkHash, "exchange");
    expect(
      (
        await db.capabilityRateBucket.findUniqueOrThrow({
          where: { keyHash: records[0].keyHash },
        })
      ).attempts,
    ).toBe(1);
  });
});
