import type { PrismaClient } from "../../generated/prisma/client";
import { demoMarker } from "./catalog";
export async function cleanupDemoSessions(db: PrismaClient, limit = 100) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Invalid demo cleanup batch.");
  const rows = await db.$queryRaw<
    { id: string }[]
  >`DELETE FROM app."DemoSession" WHERE id IN (SELECT id FROM app."DemoSession" WHERE marker=${demoMarker} AND "expiresAt"<=now() ORDER BY "expiresAt" LIMIT ${limit} FOR UPDATE SKIP LOCKED) AND marker=${demoMarker} AND "expiresAt"<=now() RETURNING id`;
  return { removed: rows.length };
}
