import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client";
import { AuthFlowError } from "./errors";

export const signupQuotas = [
  { scope: "hour", seconds: 3600, limit: 5 },
  { scope: "day", seconds: 86400, limit: 20 },
] as const;
export const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export async function reserveSignup(
  db: PrismaClient,
  networkHash: string,
  email: string,
) {
  if (!/^[a-f0-9]{64}$/.test(networkHash))
    throw new AuthFlowError("Signup is temporarily unavailable.", 503);
  const token = randomBytes(32).toString("hex");
  await db.$transaction(
    async (tx) => {
      // System-only, pre-authentication tables have RLS enabled with no browser or
      // request-role grants. Only this server-owned path consumes quota/permits.
      await tx.$executeRaw`DELETE FROM app."SignupRateBucket" WHERE "expiresAt" < NOW()`;
      await tx.$executeRaw`DELETE FROM app."SignupPermit" WHERE "expiresAt" < NOW()`;
      for (const quota of signupQuotas) {
        const key = sha256(`${quota.scope}:${networkHash}`);
        const rows = await tx.$queryRaw<Array<{ attempts: number }>>`
        INSERT INTO app."SignupRateBucket" ("keyHash", attempts, "expiresAt")
        VALUES (${key}, 1, to_timestamp((floor(extract(epoch FROM NOW()) / ${quota.seconds}) + 1) * ${quota.seconds}))
        ON CONFLICT ("keyHash") DO UPDATE SET attempts = app."SignupRateBucket".attempts + 1
        WHERE app."SignupRateBucket".attempts < ${quota.limit}
        RETURNING attempts
      `;
        if (!rows.length)
          throw new AuthFlowError(
            "Too many signup attempts. Please try again later.",
            429,
            quota.seconds,
          );
      }
      const tokenHash = sha256(token);
      const emailHash = sha256(email.trim().toLowerCase());
      await tx.$executeRaw`
        INSERT INTO app."SignupPermit" ("tokenHash", "emailHash", "expiresAt")
        VALUES (${tokenHash}, ${emailHash}, NOW() + INTERVAL '5 minutes')
      `;
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
  return token;
}
export async function discardSignupPermit(db: PrismaClient, token: string) {
  await db.signupPermit.deleteMany({ where: { tokenHash: sha256(token) } });
}
