import { dispatchMail } from "@/features/notifications/dispatch";
import { getDb } from "@/lib/server/db";
import { getUploadStorage } from "@/lib/server/uploads";
import { cleanupDemoSessions } from "@/features/demo/cleanup";
import { cleanupUploads } from "@/features/uploads/cleanup";
import { maintenanceResponse } from "@/features/maintenance/handler";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  return maintenanceResponse(request, {
    secret: process.env.CRON_SECRET,
    async cleanup() {
      const db = getDb();
      const demo = await cleanupDemoSessions(db, 100);
      const uploads = await cleanupUploads(db, getUploadStorage(), {
        limit: 25,
        maxDrainBudgetMs: 20_000,
      });
      const notifications = await dispatchMail(db, undefined, 2);
      await db.recoveryGrant.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      await db.emailVerificationProof.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      return { demo, uploads, notifications };
    },
    log: (event) => console.info(JSON.stringify(event)),
  });
}
