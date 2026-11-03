import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readStorageEnvironment } from "../src/lib/config/environment";
import { storageClient } from "../src/lib/storage/client";
import { cleanupUploads } from "../src/features/uploads/cleanup";
import { databaseConnectionOptions } from "../src/lib/config/database-connection";

config({ path: ".env", quiet: true });

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const drain = args.includes("--drain");
  const limitArg = args
    .find((a) => a.startsWith("--limit="))
    ?.replace("--limit=", "");
  const limit = limitArg ? Math.max(1, parseInt(limitArg, 10)) : 100;

  const db = new PrismaClient({
    adapter: new PrismaPg(databaseConnectionOptions(), { schema: "app" }),
  });

  try {
    const result = await cleanupUploads(
      db,
      storageClient(readStorageEnvironment()),
      {
        limit,
        dryRun,
        maxDrainBudgetMs: drain ? 300_000 : 0,
      },
    );

    console.log(
      JSON.stringify(
        {
          event: "uploads.cleanup",
          dryRun,
          drain,
          ...result,
        },
        null,
        2,
      ),
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch(() => {
  console.error(
    "Upload cleanup failed. Check connectivity and retry; no credentials or signed URLs are logged.",
  );
  process.exitCode = 1;
});
