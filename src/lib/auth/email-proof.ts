import "server-only";
import { createHash } from "node:crypto";
import { getDb } from "../server/db";
// Called only after successful provider token/code verification, never password
// login or a timestamp/user-metadata assertion. Email changes invalidate the hash.
export async function recordEmailProof(userId: string, email: string) {
  const emailHash = createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex");
  await getDb()
    .$executeRaw`INSERT INTO app."EmailVerificationProof"("userId","emailHash","verifiedAt","expiresAt") VALUES(${userId}::uuid,${emailHash},NOW(),NOW()+INTERVAL '1 day') ON CONFLICT("userId") DO UPDATE SET "emailHash"=EXCLUDED."emailHash","verifiedAt"=NOW(),"expiresAt"=EXCLUDED."expiresAt"`;
}
