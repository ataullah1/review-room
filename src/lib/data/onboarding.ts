import type { PrismaClient } from "../../generated/prisma/client";
import { bootstrapWorkspace, type VerifiedIdentity } from "./bootstrap";
import { withUserDatabase } from "./context";
import { signupNetworkHash } from "../auth/ip";
import { reserveSignup, discardSignupPermit } from "../auth/rate-limit";

// All HTTP onboarding paths use this guard, including sessions obtained directly
// from Supabase. The reserved flag is supplied only by trusted server code.
export async function bootstrapWithQuota(
  db: PrismaClient,
  user: VerifiedIdentity,
  headers: Pick<Headers, "get">,
  quotaReserved = false,
) {
  const profile = await withUserDatabase(db, user.id, (tx) =>
    tx.userProfile.findUnique({ where: { id: user.id }, select: { id: true } }),
  );
  if (!profile && !quotaReserved) {
    const permit = await reserveSignup(
      db,
      signupNetworkHash(headers),
      user.email || "oauth:onboarding",
    );
    await discardSignupPermit(db, permit);
  }
  return bootstrapWorkspace(db, user);
}
