import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { readDatabaseEnvironment } from "@/lib/config/environment";

const globalForPrisma = globalThis as unknown as {
  reviewRoomPrisma?: PrismaClient;
  reviewRoomPrismaSchema?: string;
};

let productionClient: PrismaClient | undefined;

// Construct only when a server feature asks for the database. Static pages and
// production builds do not require a database or establish connections.
export function getDb() {
  const schema = JSON.stringify(
    Object.entries(Prisma)
      .filter(([key]) => key.endsWith("ScalarFieldEnum"))
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  if (
    globalForPrisma.reviewRoomPrisma &&
    globalForPrisma.reviewRoomPrismaSchema === schema
  )
    return globalForPrisma.reviewRoomPrisma;
  if (globalForPrisma.reviewRoomPrisma) {
    // A regenerated client must replace the pre-migration instance held by Next
    // dev hot reload; otherwise new models or fields remain unavailable on transactions.
    void globalForPrisma.reviewRoomPrisma.$disconnect().catch(() => undefined);
    globalForPrisma.reviewRoomPrisma = undefined;
  }
  if (productionClient) return productionClient;
  const { DATABASE_URL } = readDatabaseEnvironment();
  const adapter = new PrismaPg(
    { connectionString: DATABASE_URL, max: 5, connectionTimeoutMillis: 5_000 },
    { schema: "app" },
  );
  const client = new PrismaClient({ adapter });
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.reviewRoomPrisma = client;
    globalForPrisma.reviewRoomPrismaSchema = schema;
  } else productionClient = client;
  return client;
}
