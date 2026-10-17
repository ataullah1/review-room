import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  readStorageEnvironment,
  readDatabaseEnvironment,
} from "../src/lib/config/environment";
import { storageClient } from "../src/lib/storage/client";
import { cleanupUploads } from "../src/features/uploads/cleanup";
config({ path: ".env", quiet: true });
async function main() {
  const { DATABASE_URL } = readDatabaseEnvironment();
  const db = new PrismaClient({
    adapter: new PrismaPg(
      { connectionString: DATABASE_URL, connectionTimeoutMillis: 15000 },
      { schema: "app" },
    ),
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
