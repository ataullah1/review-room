import { randomUUID } from "node:crypto";
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
  createInvitation,
  replaceInvitation,
} from "../../src/lib/data/sharing";
import { enqueueProjectEvent } from "../../src/features/notifications/enqueue";
import { dispatchMail } from "../../src/features/notifications/dispatch";
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
  }),
  project = randomUUID();
const scope = <T>(id: string, fn: Parameters<typeof withUserDatabase<T>>[2]) =>
  withUserDatabase(db, id, fn);
const send = vi.fn().mockResolvedValue(undefined);
beforeAll(async () => {
  await seedDevelopmentDatabase(db);
  await db.project.create({
    data: { id: project, workspaceId: ids.workspace, name: "Mail fixtures" },
  });
  await db.projectMember.createMany({
    data: [ids.client, ids.designer].map((userId) => ({
      projectId: project,
      workspaceId: ids.workspace,
      userId,
    })),
  });
  vi.stubEnv("MAIL_ENABLED", "true");
  vi.stubEnv("MAIL_API_URL", "https://mail.example.test/send");
  vi.stubEnv("MAIL_API_KEY", "fake-key");
  vi.stubEnv("MAIL_FROM", "sender@example.test");
  vi.stubEnv("MAIL_PAYLOAD_SECRET", "a".repeat(64));
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "test-only-not-real");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://review.example.test");
});
afterAll(async () => {
  await db.notificationJob.deleteMany({ where: { projectId: project } });
  await db.notificationPreference.deleteMany({ where: { userId: ids.client } });
  await db.project.delete({ where: { id: project } });
  await db.$disconnect();
  vi.unstubAllEnvs();
});
it("commits an encrypted invitation independently of delivery, retries and redacts secrets", async () => {
  const invitation = await scope(ids.owner, (tx) =>
    createInvitation(tx, ids.owner, ids.workspace, project, {
      email: "recipient@example.test",
      role: "CLIENT",
    }),
  );
  const queued = await db.notificationJob.findFirstOrThrow({
    where: { sourceId: invitation.id },
  });
  expect(queued.payload).not.toContain(invitation.token);
  expect(queued.payload).not.toContain("recipient@example.test");
  send.mockRejectedValueOnce(new Error("SMTP unavailable"));
  const result = await dispatchMail(db, send, 1);
  expect(result.failed).toBe(1);
  expect(
    await db.projectInvitation.findUnique({ where: { id: invitation.id } }),
  ).not.toBeNull();
  await db.$executeRaw`UPDATE app."NotificationJob" SET "nextAttemptAt"=NOW()-INTERVAL '1 second' WHERE id=${queued.id}::uuid`;
  await dispatchMail(db, send, 1);
  const done = await db.notificationJob.findUniqueOrThrow({
    where: { id: queued.id },
  });
  expect(done.sentAt).not.toBeNull();
  expect(done.payload).toBeNull();
  expect(send).toHaveBeenLastCalledWith(
    expect.objectContaining({
      to: "recipient@example.test",
      idempotencyKey: queued.id,
    }),
  );
});
it("cancels a replaced invitation and keeps only its new secret eligible", async () => {
  const old = await scope(ids.owner, (tx) =>
    createInvitation(tx, ids.owner, ids.workspace, project, {
      email: "other@example.test",
      role: "CLIENT",
    }),
  );
  const replacement = await scope(ids.owner, (tx) =>
    replaceInvitation(tx, ids.owner, ids.workspace, project, old.id),
  );
  await dispatchMail(db, send, 10);
  expect(
    (await db.notificationJob.findFirstOrThrow({ where: { sourceId: old.id } }))
      .cancelledAt,
  ).not.toBeNull();
  expect(
    (
      await db.notificationJob.findFirstOrThrow({
        where: { sourceId: replacement.id },
      })
    ).sentAt,
  ).not.toBeNull();
});
it("deduplicates events and rechecks project access and preferences", async () => {
  const source = randomUUID();
  await scope(ids.client, async (tx) => {
    await enqueueProjectEvent(
      tx,
      ids.workspace,
      project,
      ids.client,
      "COMMENT",
      source,
    );
    await enqueueProjectEvent(
      tx,
      ids.workspace,
      project,
      ids.client,
      "COMMENT",
      source,
    );
  });
  const jobs = await db.notificationJob.findMany({
    where: { sourceId: source },
  });
  expect(jobs.map((j) => j.recipientId).sort()).toEqual(
    [ids.owner, ids.designer].sort(),
  );
  await db.projectMember.delete({
    where: { projectId_userId: { projectId: project, userId: ids.designer } },
  });
  // Source never existed: neither recipient is eligible for a content notification.
  await dispatchMail(db, send, 10, async () => "synthetic@example.test");
  expect(
    await db.notificationJob.count({
      where: { sourceId: source, cancelledAt: { not: null } },
    }),
  ).toBe(2);
  await scope(ids.client, (tx) =>
    tx.notificationPreference.upsert({
      where: { userId: ids.client },
      create: { userId: ids.client, emailEnabled: false },
      update: { emailEnabled: false },
    }),
  );
  await expect(
    scope(ids.designer, (tx) =>
      tx.notificationPreference.update({
        where: { userId: ids.client },
        data: { emailEnabled: true },
      }),
    ),
  ).rejects.toThrow();
});
