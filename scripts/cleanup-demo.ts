import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { cleanupDemoSessions } from "../src/features/demo/cleanup";
import { databaseConnectionOptions } from "../src/lib/config/database-connection";
config({ path: ".env", quiet: true });
async function main() {
  const db = new PrismaClient({
    adapter: new PrismaPg(databaseConnectionOptions(), { schema: "app" }),
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
