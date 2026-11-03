import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { reconcileWorkspaceStorage } from "../src/lib/data/storage-accounting";
import { databaseConnectionOptions } from "../src/lib/config/database-connection";

config({ path: ".env", quiet: true });

async function main() {
  const args = process.argv.slice(2);
  const wsArg = args
    .find((a) => a.startsWith("--workspace="))
    ?.replace("--workspace=", "");

  const db = new PrismaClient({
    adapter: new PrismaPg(databaseConnectionOptions(), { schema: "app" }),
  });

  try {
    const reports = await reconcileWorkspaceStorage(db, wsArg || undefined);

    console.log(
      JSON.stringify(
        {
          event: "storage.reconciliation",
          timestamp: new Date().toISOString(),
          workspacesCount: reports.length,
          reports: reports.map((r) => ({
            workspaceId: r.workspaceId,
            workspaceName: r.workspaceName,
            committedBytes: r.committedBytes,
            committedMb: (r.committedBytes / (1024 * 1024)).toFixed(2),
            reservedBytes: r.reservedBytes,
            reservedMb: (r.reservedBytes / (1024 * 1024)).toFixed(2),
            stalePendingBytes: r.stalePendingBytes,
            totalAccountedBytes: r.totalAccountedBytes,
            totalAccountedMb: (r.totalAccountedBytes / (1024 * 1024)).toFixed(
              2,
            ),
            readyVersionsCount: r.readyVersionsCount,
            activePendingCount: r.activePendingCount,
            expiredPendingCount: r.expiredPendingCount,
            failedVersionsCount: r.failedVersionsCount,
            maxStorageMb: (r.maxStorageBytes / (1024 * 1024)).toFixed(0),
            isOverLimit: r.isOverLimit,
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("Storage reconciliation failed:", err.message);
  process.exitCode = 1;
});
