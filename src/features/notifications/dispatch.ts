import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  PrismaClient,
  NotificationJob,
  Prisma,
} from "@/generated/prisma/client";
import { createClient } from "@supabase/supabase-js";
import { isExistingDemoEmail } from "../reviewer-demo/config";
import { readAppOrigin } from "../../lib/config/deployment";
import { mailEnabled, openMail } from "./crypto";
const payloadSchema = z.object({
  invitationId: z.uuid().optional(),
  token: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  email: z.email().optional(),
});
type SendMail = (mail: {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}) => Promise<void>;
export function httpMailTransport(): SendMail {
  return async (mail) => {
    const response = await fetch(process.env.MAIL_API_URL!, {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${process.env.MAIL_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": mail.idempotencyKey,
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
      }),
    });
    if (!response.ok) throw new Error("mail_provider_failed");
  };
}
async function eligible(db: PrismaClient, job: NotificationJob) {
  const project = await db.project.findFirst({
    where: {
      id: job.projectId,
      workspaceId: job.workspaceId,
      archivedAt: null,
    },
  });
  if (!project) return null;
  if (
    await db.reviewerDemoAccount.count({
      where: { workspaceId: job.workspaceId },
    })
  )
    return null;
  if (job.kind !== "INVITATION") {
    if (!job.recipientId) return null;
    const member = await db.membership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: job.workspaceId,
          userId: job.recipientId,
        },
      },
    });
    if (!member) return null;
    if (
      member.role !== "OWNER" &&
      !(await db.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId: job.projectId,
            userId: job.recipientId,
          },
        },
      }))
    )
      return null;
    if (
      (
        await db.notificationPreference.findUnique({
          where: { userId: job.recipientId },
        })
      )?.emailEnabled === false
    )
      return null;
  }
  return project;
}
export async function dispatchMail(
  db: PrismaClient,
  send: SendMail = httpMailTransport(),
  limit = 10,
  resolveEmail?: (userId: string) => Promise<string | undefined>,
) {
  if (!mailEnabled())
    return { sent: 0, failed: 0, cancelled: 0, enabled: false };
  const auth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const system = <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) =>
    db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
      return operation(tx);
    });
  const updateJobs = (args: Prisma.NotificationJobUpdateManyArgs) =>
    system((tx) => tx.notificationJob.updateMany(args));
  const findJobs = (args: Prisma.NotificationJobFindManyArgs) =>
    system((tx) => tx.notificationJob.findMany(args));
  const now = new Date(),
    token = randomUUID();
  // Remove expired encrypted capability secrets even when an old lease is abandoned.
  await updateJobs({
    where: { expiresAt: { lte: now }, payload: { not: null } },
    data: {
      payload: null,
      cancelledAt: now,
      leaseToken: null,
      leaseUntil: null,
    },
  });
  const ids = await findJobs({
    where: {
      sentAt: null,
      cancelledAt: null,
      expiresAt: { gt: now },
      nextAttemptAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    orderBy: { createdAt: "asc" },
    take: Math.min(25, Math.max(1, limit)),
    select: { id: true },
  });
  await updateJobs({
    where: {
      id: { in: ids.map((j) => j.id) },
      sentAt: null,
      cancelledAt: null,
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    data: {
      leaseToken: token,
      leaseUntil: new Date(+now + 60000),
      attempts: { increment: 1 },
    },
  });
  const jobs = await findJobs({
    where: { leaseToken: token },
  });
  let sent = 0,
    failed = 0,
    cancelled = 0;
  for (const job of jobs) {
    try {
      const project = await eligible(db, job);
      let email: string | undefined, href: string | undefined;
      const payload = payloadSchema.parse(
        openMail(job.payload || "", process.env.MAIL_PAYLOAD_SECRET!),
      );
      if (project && job.kind === "INVITATION") {
        const invitation = await system((tx) =>
          tx.projectInvitation.findFirst({
            where: {
              id: job.sourceId,
              projectId: job.projectId,
              workspaceId: job.workspaceId,
              revokedAt: null,
              acceptedAt: null,
              expiresAt: { gt: new Date() },
            },
          }),
        );
        if (invitation && payload.token && payload.email === invitation.email) {
          email = invitation.email;
          href = `${readAppOrigin()}/invite#${payload.token}`;
        }
      } else if (project && job.recipientId) {
        if (resolveEmail) email = await resolveEmail(job.recipientId);
        else {
          const { data, error } = await auth.auth.admin.getUserById(
            job.recipientId,
          );
          if (error) throw new Error("recipient_lookup_failed");
          email = data.user?.email;
        }
        if (job.kind === "REVIEW_READY") {
          const round = await db.reviewRound.findFirst({
            where: { id: job.sourceId, projectId: job.projectId },
          });
          const asset = round
            ? await db.asset.findUnique({ where: { id: round.assetId } })
            : null;
          const latest = round
            ? await db.reviewRound.findFirst({
                where: { versionId: round.versionId },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              })
            : null;
          const required = round
            ? await db.reviewRoundReviewer.findUnique({
                where: {
                  roundId_userId: {
                    roundId: round.id,
                    userId: job.recipientId,
                  },
                },
              })
            : null;
          if (
            !round ||
            !required ||
            asset?.currentVersionId !== round.versionId ||
            latest?.id !== round.id
          )
            email = undefined;
          else
            href = `${readAppOrigin()}/app/${job.workspaceId}/projects/${job.projectId}/assets/${round.assetId}`;
        } else {
          const source =
            job.kind === "COMMENT"
              ? await db.comment.findUnique({ where: { id: job.sourceId } })
              : await db.reviewDecision.findUnique({
                  where: { id: job.sourceId },
                });
          const version = source
            ? await db.assetVersion.findUnique({
                where: { id: source.versionId },
              })
            : null;
          if (!version || version.projectId !== job.projectId)
            email = undefined;
          else
            href = `${readAppOrigin()}/app/${job.workspaceId}/projects/${job.projectId}/assets/${version.assetId}`;
        }
      }
      if (!project || !email || !href || isExistingDemoEmail(email)) {
        await updateJobs({
          where: { id: job.id, leaseToken: token },
          data: {
            cancelledAt: new Date(),
            payload: null,
            leaseToken: null,
            leaseUntil: null,
            lastCode: "not_authorized_or_expired",
          },
        });
        cancelled++;
        continue;
      }
      // Recheck immediately before contacting the provider. Opening the app always
      // performs authorization again; mail cannot grant access by itself.
      if (!(await eligible(db, job))) throw new Error("authorization_changed");
      const subject =
        job.kind === "INVITATION"
          ? "You're invited to review a design"
          : job.kind === "REVIEW_READY"
            ? "A design is ready for your review"
            : job.kind === "COMMENT"
              ? "New project feedback"
              : "A client recorded a review decision";
      await send({
        to: email,
        subject: `Review Room — ${subject}`,
        text: `${subject}.\n\n${href}\n\nSign in with your invited account. This message contains no private design preview or feedback text.`,
        idempotencyKey: job.id,
      });
      await updateJobs({
        where: { id: job.id, leaseToken: token },
        data: {
          sentAt: new Date(),
          payload: null,
          leaseToken: null,
          leaseUntil: null,
          lastCode: "delivered",
        },
      });
      sent++;
    } catch {
      const terminal = job.attempts >= 5;
      await updateJobs({
        where: { id: job.id, leaseToken: token },
        data: {
          cancelledAt: terminal ? new Date() : null,
          payload: terminal ? null : job.payload,
          leaseToken: null,
          leaseUntil: null,
          nextAttemptAt: new Date(
            Date.now() + Math.min(3600000, 60000 * 2 ** job.attempts),
          ),
          lastCode: terminal ? "delivery_exhausted" : "retry_scheduled",
        },
      });
      failed++;
    }
  }
  return { sent, failed, cancelled, enabled: true };
}
