import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readDatabaseEnvironment } from "../src/lib/config/environment";
import { cleanupDemoSessions } from "../src/features/demo/cleanup";
config({ path: ".env", quiet: true });
async function main() {
  const { DATABASE_URL } = readDatabaseEnvironment(),
    db = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: DATABASE_URL, connectionTimeoutMillis: 15000 },
        { schema: "app" },
      ),
    });
  try {
    console.log(await cleanupDemoSessions(db));
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error("Demo cleanup failed. Check connectivity and retry.");
  process.exitCode = 1;
});
