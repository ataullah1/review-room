import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { readDatabaseEnvironment } from "../src/lib/config/environment";

config({ path: ".env", quiet: true });
async function main() {
  const { DATABASE_URL } = readDatabaseEnvironment();
  const db = new PrismaClient({
    adapter: new PrismaPg(
      { connectionString: DATABASE_URL },
      { schema: "app" },
    ),
  });
  try {
    await db.$queryRaw`SELECT 1`;
    console.log(
      `Database connected; ${await db.workspace.count()} application workspaces found.`,
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error(
    "Database check failed. Verify .env, connectivity and migrations; connection values are not logged.",
  );
  process.exitCode = 1;
});
