import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readStorageEnvironment } from "../src/lib/config/environment";
import { storageClient } from "../src/lib/storage/client";
import { cleanupUploads } from "../src/features/uploads/cleanup";
import { databaseConnectionOptions } from "../src/lib/config/database-connection";
config({ path: ".env", quiet: true });
async function main() {
  const db = new PrismaClient({
    adapter: new PrismaPg(databaseConnectionOptions(), { schema: "app" }),
  });
  try {
    console.log(
      await cleanupUploads(db, storageClient(readStorageEnvironment()), 100),
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
