import type { PrismaClient } from "../../generated/prisma/client";
import type { UserDatabase } from "./context";
import { AccessError } from "../auth/errors";
import { requireProjectRole } from "./permissions";
import { reviewVersion } from "./comments";
import {
  hashToken,
  makeToken,
  inviteInput,
} from "../../features/sharing/tokens";
import { z } from "zod";
export function capabilityResult<T>(
  value: T | { error: string; status: number },
): T {
  if (value && typeof value === "object" && "error" in value)
    throw new AccessError(
      String(value.error),
      "status" in value ? Number(value.status) : 404,
    );
  return value as T;
}
export async function withCapabilityDatabase<T>(
  db: PrismaClient,
  op: (tx: UserDatabase) => Promise<T>,
) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE review_room_capability");
      await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
      return op(tx);
    },
    { maxWait: 10000, timeout: 15000 },
  );
}
async function owner(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  active = true,
) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`project:${projectId}`},0))::text`;
  const access = await requireProjectRole(tx, userId, workspaceId, projectId, [
    "OWNER",
  ]);
  if (active && access.project.archivedAt)
    throw new AccessError("Restore this project before creating links.", 409);
  return access;
}
async function expiry(tx: UserDatabase, days: number) {
  const rows = await tx.$queryRaw<
    { value: Date }[]
  >`SELECT date_trunc('milliseconds',now())+make_interval(days=>${days}) AS value`;
  return rows[0].value;
}
export async function createInvitation(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  input: unknown,
) {
  await owner(tx, userId, workspaceId, projectId);
  if (
    (await tx.projectInvitation.count({
      where: {
        projectId,
        workspaceId,
        revokedAt: null,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    })) >= 50
  )
    throw new AccessError(
      "Revoke an active invitation before creating another (maximum 50).",
      429,
    );
  const data = inviteInput.parse(input),
    token = makeToken(),
    row = await tx.projectInvitation.create({
      data: {
        ...data,
        workspaceId,
        projectId,
        tokenHash: hashToken(token),
        expiresAt: await expiry(tx, 7),
      },
    });
  return { id: row.id, token, expiresAt: row.expiresAt.toISOString() };
}
export async function listInvitations(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
) {
  await requireProjectRole(tx, userId, workspaceId, projectId, ["OWNER"]);
  return tx.projectInvitation.findMany({
    where: { workspaceId, projectId },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
    },
    orderBy: [
      { revokedAt: { sort: "asc", nulls: "first" } },
      { acceptedAt: { sort: "asc", nulls: "first" } },
      { expiresAt: "desc" },
      { id: "desc" },
    ],
    take: 50,
  });
}
export async function revokeInvitation(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  id: string,
) {
  await owner(tx, userId, workspaceId, projectId, false);
  z.uuid().parse(id);
  const row = await tx.projectInvitation.findFirst({
    where: { id, workspaceId, projectId },
  });
  if (!row) throw new AccessError("Invitation not found.", 404);
  if (!row.revokedAt)
    await tx.projectInvitation.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  return { revoked: true };
}
export type InvitationPreview = {
  id: string;
  projectName: string;
  role: "CLIENT" | "DESIGNER";
  expiresAt: string;
  accepted: boolean;
};
export async function inspectInvitation(tx: UserDatabase, token: string) {
  const rows = await tx.$queryRaw<
    { value: InvitationPreview }[]
  >`SELECT app.inspect_invitation(${hashToken(token)}) AS value`;
  return capabilityResult(rows[0].value);
}
export async function acceptInvitation(
  tx: UserDatabase,
  token: string,
  identity: { email?: string; emailVerified: boolean },
) {
  const rows = await tx.$queryRaw<
    { value: { workspaceId: string; projectId: string } }[]
  >`SELECT app.accept_invitation(${hashToken(token)},${identity.email || null},${identity.emailVerified}) AS value`;
  return capabilityResult(rows[0].value);
}
export async function createShare(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  assetId: string,
  versionId: string,
) {
  await owner(tx, userId, workspaceId, projectId);
  await reviewVersion(tx, userId, workspaceId, projectId, assetId, versionId);
  if (
    (await tx.shareLink.count({
      where: { versionId, revokedAt: null, expiresAt: { gt: new Date() } },
    })) >= 50
  )
    throw new AccessError(
      "Revoke an active share before creating another (maximum 50).",
      429,
    );
  const token = makeToken(),
    row = await tx.shareLink.create({
      data: {
        versionId,
        tokenHash: hashToken(token),
        expiresAt: await expiry(tx, 1),
      },
    });
  return { id: row.id, token, expiresAt: row.expiresAt.toISOString() };
}
export async function listShares(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  assetId: string,
  versionId: string,
) {
  const data = await reviewVersion(
    tx,
    userId,
    workspaceId,
    projectId,
    assetId,
    versionId,
  );
  if (data.member.role !== "OWNER") throw new AccessError();
  return tx.shareLink.findMany({
    where: { versionId },
    select: { id: true, expiresAt: true, revokedAt: true },
    orderBy: [
      { revokedAt: { sort: "asc", nulls: "first" } },
      { expiresAt: "desc" },
      { id: "desc" },
    ],
    take: 50,
  });
}
export async function revokeShare(
  tx: UserDatabase,
  userId: string,
  workspaceId: string,
  projectId: string,
  assetId: string,
  versionId: string,
  id: string,
) {
  await owner(tx, userId, workspaceId, projectId, false);
  await reviewVersion(tx, userId, workspaceId, projectId, assetId, versionId);
  z.uuid().parse(id);
  const row = await tx.shareLink.findFirst({ where: { id, versionId } });
  if (!row) throw new AccessError("Share not found.", 404);
  if (!row.revokedAt)
    await tx.shareLink.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  return { revoked: true };
}
export type SharedVersion = {
  id: string;
  title: string;
  versionId: string;
  versionNumber: number;
  width: number;
  height: number;
  objectKey: string;
  expiresAt: string;
};
export async function exchangeShare(tx: UserDatabase, token: string) {
  const rows = await tx.$queryRaw<
    { value: { id: string; expiresAt: string } }[]
  >`SELECT app.exchange_share(${hashToken(token)}) AS value`;
  return capabilityResult(rows[0].value);
}
export async function readShare(tx: UserDatabase, id: string, token: string) {
  z.uuid().parse(id);
  const rows = await tx.$queryRaw<
    { value: SharedVersion }[]
  >`SELECT app.read_share(${id}::uuid,${hashToken(token)}) AS value`;
  return capabilityResult(rows[0].value);
}
export async function sharedComments<T>(
  tx: UserDatabase,
  id: string,
  token: string,
  after = 0,
  rootId?: string,
  afterReply?: string,
): Promise<T> {
  z.uuid().parse(id);
  if (rootId) z.uuid().parse(rootId);
  if (afterReply) z.uuid().parse(afterReply);
  const rows = await tx.$queryRaw<
    { value: T }[]
  >`SELECT app.read_shared_comments(${id}::uuid,${hashToken(token)},${after}::integer,${rootId || null}::uuid,${afterReply || null}::uuid) AS value`;
  return capabilityResult(rows[0].value);
}
