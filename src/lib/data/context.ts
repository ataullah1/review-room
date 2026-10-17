import { z } from "zod";
import type { PrismaClient, Prisma } from "../../generated/prisma/client";
import { AccessError } from "../auth/errors";

export type UserDatabase = Prisma.TransactionClient;
export async function withUserDatabase<T>(
  db: PrismaClient,
  userId: string,
  operation: (tx: UserDatabase) => Promise<T>,
): Promise<T> {
  if (!z.uuid().safeParse(userId).success)
    throw new AccessError("Please sign in.", 401);
  return db.$transaction(
    async (tx) => {
      // SET LOCAL is transaction-scoped, so pooled connections never retain another
      // request's identity. This role is neither an owner nor BYPASSRLS.
      await tx.$executeRawUnsafe("SET LOCAL ROLE review_room_user");
      await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
      await tx.$queryRaw`SELECT set_config('request.jwt.claim.sub', ${userId}, true)`;
      return operation(tx);
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
}
