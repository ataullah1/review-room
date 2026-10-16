import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { assertLocalDatabase } from "./local-safety";
import { seedDevelopmentDatabase } from "./seed-data";

config({ path: ".env", quiet: true });
async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Development seed is disabled in production.");
  const connectionString = assertLocalDatabase(process.env.DIRECT_URL, "seed");
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString }, { schema: "app" }),
  });
  try {
    await seedDevelopmentDatabase(db);
    console.log(
      "Local fixtures ready: 2 workspaces, 5 profiles, 2 projects. No Auth accounts were created.",
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error(
    "Development seed failed. Check local database setup; connection values are not logged.",
  );
  process.exitCode = 1;
});
