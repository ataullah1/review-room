import type { PrismaClient } from "../../generated/prisma/client";
import { signupNetworkHash } from "../../lib/auth/ip";
import { AccessError } from "../../lib/auth/errors";
import { createHash } from "node:crypto";
export async function consumeCapabilityQuota(
  db: PrismaClient,
  networkHash: string,
  scope: "exchange" | "read" | "accept",
) {
  if (!/^[a-f0-9]{64}$/.test(networkHash))
    throw new AccessError("Link access is temporarily unavailable.", 503);
  const key = createHash("sha256")
      .update(`capability:${scope}:${networkHash}`)
      .digest("hex"),
    limit = scope === "read" ? 120 : 40,
    seconds = scope === "read" ? 60 : 600;
  const rows = await db.$queryRaw<
    { attempts: number }[]
  >`INSERT INTO app."CapabilityRateBucket"("keyHash",attempts,"expiresAt") VALUES(${key},1,now()+make_interval(secs=>${seconds})) ON CONFLICT("keyHash") DO UPDATE SET attempts=CASE WHEN app."CapabilityRateBucket"."expiresAt"<=now() THEN 1 ELSE app."CapabilityRateBucket".attempts+1 END,"expiresAt"=CASE WHEN app."CapabilityRateBucket"."expiresAt"<=now() THEN now()+make_interval(secs=>${seconds}) ELSE app."CapabilityRateBucket"."expiresAt" END WHERE app."CapabilityRateBucket"."expiresAt"<=now() OR app."CapabilityRateBucket".attempts<${limit} RETURNING attempts`;
  if (!rows.length)
    throw new AccessError(
      "Too many link requests. Please try again later.",
      429,
    );
  await db.$executeRaw`DELETE FROM app."CapabilityRateBucket" WHERE "keyHash" IN (SELECT "keyHash" FROM app."CapabilityRateBucket" WHERE "expiresAt"<now() LIMIT 100)`;
}
export async function limitCapability(
  db: PrismaClient,
  headers: Pick<Headers, "get">,
  scope: "exchange" | "read" | "accept",
) {
  let network: string;
  try {
    network = signupNetworkHash(headers);
  } catch {
    throw new AccessError("Link access is temporarily unavailable.", 503);
  }
  await consumeCapabilityQuota(db, network, scope);
}
