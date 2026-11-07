import { randomUUID, createHash } from "node:crypto";
import { beforeAll, afterAll, it, expect, describe } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { assertLocalDatabase } from "../../prisma/local-safety";
import {
  fixtureIds as ids,
  seedDevelopmentDatabase,
} from "../../prisma/seed-data";
import { withUserDatabase } from "../../src/lib/data/context";
import {
  requestReview,
  reviewRoundStatus,
  reviewRoundHistory,
} from "../../src/lib/data/review-rounds";
import {
  changeCompletion,
  deliverySnapshot,
} from "../../src/lib/data/completion";
import { createComment, resolveComment } from "../../src/lib/data/comments";
import { submitDecision } from "../../src/lib/data/reviews";
import {
  prepareUpload,
  claimUpload,
  publishUpload,
} from "../../src/lib/data/uploads";
import { assertStorageAvailable } from "../../src/lib/data/storage-accounting";
import { bootstrapWorkspace } from "../../src/lib/data/bootstrap";
import { createInvitation, acceptInvitation } from "../../src/lib/data/sharing";
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
  secondClient = randomUUID(),
  asset = randomUUID(),
  version = randomUUID(),
  workspace = ids.workspace;
const scope = <T>(id: string, fn: Parameters<typeof withUserDatabase<T>>[2]) =>
  withUserDatabase(db, id, fn);
const status = () => scope(ids.client, (tx) => reviewRoundStatus(tx, version));
const round = (reviewerIds = [ids.client as string, secondClient]) =>
  scope(ids.designer, (tx) =>
    requestReview(tx, ids.designer, workspace, project, asset, {
      id: randomUUID(),
      versionId: version,
      reviewerIds,
      reason: "Please review the final direction.",
    }),
  );
const decide = (
  userId: string,
  decision: "APPROVED" | "CHANGES_REQUESTED" = "APPROVED",
) =>
  scope(userId, (tx) =>
    submitDecision(tx, userId, workspace, project, asset, {
      id: randomUUID(),
      expectedCurrentVersionId: version,
      decision,
      note: decision === "CHANGES_REQUESTED" ? "Change spacing." : null,
    }),
  );
beforeAll(async () => {
  await seedDevelopmentDatabase(db);
  await db.userProfile.create({
    data: { id: secondClient, displayName: "Second client" },
  });
  await db.membership.create({
    data: { workspaceId: workspace, userId: secondClient, role: "CLIENT" },
  });
  await db.project.create({
    data: {
      id: project,
      workspaceId: workspace,
      name: "Lifecycle integration",
    },
  });
  await db.projectMember.createMany({
    data: [ids.designer, ids.client, secondClient].map((userId) => ({
      workspaceId: workspace,
      projectId: project,
      userId,
    })),
  });
  await db.asset.create({
    data: {
      id: asset,
      workspaceId: workspace,
      projectId: project,
      title: "Final design",
    },
  });
  await db.assetVersion.create({
    data: {
      id: version,
      assetId: asset,
      workspaceId: workspace,
      projectId: project,
      creatorId: ids.designer,
      originalName: "design.png",
      expectedMimeType: "image/png",
      expectedSize: 100,
      stagingKey: `test/${version}/staging`,
      objectKey: `test/${version}/original`,
      expiresAt: new Date(Date.now() + 600000),
      cleanupAfter: new Date(Date.now() + 7200000),
    },
  });
  await db.assetVersion.update({
    where: { id: version },
    data: {
      status: "READY",
      mimeType: "image/png",
      fileSize: 100,
      width: 10,
      height: 10,
      contentHash: "a".repeat(64),
    },
  });
  await db.asset.update({
    where: { id: asset },
    data: { currentVersionId: version },
  });
});
afterAll(async () => {
  await db.project.update({
    where: { id: project },
    data: { completionId: null },
  });
  await db.projectReopening.deleteMany({ where: { projectId: project } });
  await db.projectCompletion.deleteMany({ where: { projectId: project } });
  await db.reviewRound.deleteMany({ where: { projectId: project } });
  await db.project.delete({ where: { id: project } });
  await db.emailVerificationProof.deleteMany({
    where: { userId: secondClient },
  });
  await db.membership.deleteMany({ where: { userId: secondClient } });
  await db.userProfile.delete({ where: { id: secondClient } });
  await db.$disconnect();
});
describe("required reviews, completion and delivery isolation", () => {
  it("preserves legacy decisions without inventing aggregate approval", async () => {
    await decide(ids.client);
    expect((await status()).state).toBe("UNCONFIGURED");
    await expect(round([])).rejects.toThrow();
    await round();
    expect((await status()).state).toBe("AWAITING_REVIEW");
    const history = await scope(ids.client, (tx) =>
      reviewRoundHistory(tx, ids.client, workspace, project, asset, version),
    );
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      reason: "Please review the final direction.",
      requestedByName: "Sample designer",
      reviewers: expect.arrayContaining([
        expect.objectContaining({ reviewerName: "Second client" }),
      ]),
    });
    await expect(
      scope(ids.outsider, (tx) =>
        reviewRoundHistory(
          tx,
          ids.outsider,
          workspace,
          project,
          asset,
          version,
        ),
      ),
    ).rejects.toThrow();
  });
  it("combines conflicting reviewers, unresolved pins and access changes", async () => {
    await decide(ids.client);
    await decide(secondClient, "CHANGES_REQUESTED");
    expect((await status()).state).toBe("CHANGES_REQUESTED");
    const root = await scope(ids.client, (tx) =>
      createComment(tx, ids.client, workspace, project, asset, version, {
        id: randomUUID(),
        body: "Resolve this detail.",
        xRatio: 0.2,
        yRatio: 0.3,
      }),
    );
    await decide(secondClient);
    expect((await status()).state).toBe("FEEDBACK_OPEN");
    await scope(ids.designer, (tx) =>
      resolveComment(
        tx,
        ids.designer,
        workspace,
        project,
        asset,
        version,
        root.id,
        true,
      ),
    );
    expect((await status()).state).toBe("APPROVED");
    await db.projectMember.delete({
      where: { projectId_userId: { projectId: project, userId: secondClient } },
    });
    expect((await status()).state).toBe("REVIEWERS_REQUIRED");
    await db.projectMember.create({
      data: {
        projectId: project,
        workspaceId: workspace,
        userId: secondClient,
      },
    });
  });
  it("freezes completion, blocks old write paths and preserves snapshots on reopen", async () => {
    await expect(
      scope(ids.designer, (tx) =>
        changeCompletion(tx, ids.designer, workspace, project, {
          id: randomUUID(),
          operation: "complete",
        }),
      ),
    ).rejects.toThrow();
    const prepared = await scope(ids.designer, (tx) =>
      prepareUpload(tx, ids.designer, workspace, project, {
        assetId: asset,
        name: "next.png",
        mimeType: "image/png",
        size: 100,
      }),
    );
    const claimed = await scope(ids.designer, (tx) =>
      claimUpload(tx, ids.designer, workspace, project, prepared.id),
    );
    const completion = await scope(ids.owner, (tx) =>
      changeCompletion(tx, ids.owner, workspace, project, {
        id: randomUUID(),
        operation: "complete",
      }),
    );
    expect(completion).toHaveProperty("id");
    const snapshot = await scope(ids.client, (tx) =>
      deliverySnapshot(tx, ids.client, workspace, project),
    );
    expect(snapshot.snapshot?.manifest.files[0]).toMatchObject({
      versionId: version,
      contentHash: "a".repeat(64),
    });
    expect(JSON.stringify(snapshot.snapshot?.manifest)).not.toContain(
      "objectKey",
    );
    await expect(decide(ids.client)).rejects.toThrow("Reopen");
    await expect(
      scope(ids.designer, (tx) =>
        publishUpload(
          tx,
          ids.designer,
          workspace,
          project,
          prepared.id,
          claimed.token!,
          {
            mimeType: "image/png",
            fileSize: 100,
            width: 10,
            height: 10,
            contentHash: "b".repeat(64),
          },
        ),
      ),
    ).rejects.toThrow("Reopen");
    await expect(
      scope(ids.client, (tx) =>
        tx.comment.create({
          data: {
            id: randomUUID(),
            versionId: version,
            authorId: ids.client,
            threadNumber: 20,
            xRatio: 0.5,
            yRatio: 0.5,
            body: "Forbidden completed write",
          },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      scope(ids.outsider, (tx) =>
        deliverySnapshot(tx, ids.outsider, workspace, project),
      ),
    ).rejects.toThrow();
    await scope(ids.owner, (tx) =>
      changeCompletion(tx, ids.owner, workspace, project, {
        id: randomUUID(),
        operation: "reopen",
        reason: "New revision requested.",
      }),
    );
    expect(
      (
        await scope(ids.client, (tx) =>
          deliverySnapshot(tx, ids.client, workspace, project),
        )
      ).snapshot?.id,
    ).toBe(snapshot.snapshot?.id);
    await scope(ids.designer, (tx) =>
      publishUpload(
        tx,
        ids.designer,
        workspace,
        project,
        prepared.id,
        claimed.token!,
        {
          mimeType: "image/png",
          fileSize: 100,
          width: 10,
          height: 10,
          contentHash: "b".repeat(64),
        },
      ),
    );
    expect(
      (await scope(ids.client, (tx) => reviewRoundStatus(tx, prepared.id)))
        .state,
    ).toBe("UNCONFIGURED");
  });
  it("enforces workspace capacity across hidden projects and pending uploaders", async () => {
    const temp = randomUUID();
    await db.project.create({
      data: {
        id: temp,
        workspaceId: workspace,
        name: "Hidden accounting fixture",
      },
    });
    try {
      const reserved = await scope(ids.owner, (tx) =>
        prepareUpload(tx, ids.owner, workspace, temp, {
          name: "owner.png",
          mimeType: "image/png",
          size: 500,
        }),
      );
      await expect(
        scope(ids.designer, (tx) =>
          assertStorageAvailable(tx, ids.designer, workspace, 100, {
            maxStorageBytes: 200,
            maxReadyVersions: 1000,
            maxPendingUploads: 100,
          }),
        ),
      ).rejects.toMatchObject({ status: 429 });
      const ready = await db.assetVersion.count({
        where: { workspaceId: workspace, status: "READY" },
      });
      await expect(
        scope(ids.designer, (tx) =>
          assertStorageAvailable(tx, ids.designer, workspace, 1, {
            maxStorageBytes: 1e9,
            maxReadyVersions: ready,
            maxPendingUploads: 100,
          }),
        ),
      ).rejects.toMatchObject({ status: 429 });
      expect(reserved.status).toBe("PENDING");
    } finally {
      await db.project.delete({ where: { id: temp } });
    }
  });
  it("requires real mailbox proof and does not create an empty invitee workspace", async () => {
    const email = "lifecycle-invite@example.test";
    const invitation = await scope(ids.owner, (tx) =>
      createInvitation(tx, ids.owner, workspace, project, {
        email,
        role: "CLIENT",
      }),
    );
    await expect(
      scope(secondClient, (tx) =>
        acceptInvitation(tx, invitation.token, { email, emailVerified: true }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await db.$executeRaw`INSERT INTO app."EmailVerificationProof"("userId","emailHash","expiresAt") VALUES(${secondClient}::uuid,${createHash("sha256").update(email).digest("hex")},NOW()+INTERVAL '1 day')`;
    await scope(secondClient, (tx) =>
      acceptInvitation(tx, invitation.token, { email, emailVerified: true }),
    );
    const joined = await bootstrapWorkspace(
      db,
      { id: secondClient, email },
      true,
    );
    expect(joined?.id).toBe(workspace);
    expect(
      await db.workspace.findUnique({ where: { createdById: secondClient } }),
    ).toBeNull();
  });
});
