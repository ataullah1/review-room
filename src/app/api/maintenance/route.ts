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
      const uploads = await cleanupUploads(db, getUploadStorage(), 5);
      return { demo, uploads };
    },
    log: (event) => console.info(JSON.stringify(event)),
  });
}
