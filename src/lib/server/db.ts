import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { readDatabaseEnvironment } from "@/lib/config/environment";

const globalForPrisma = globalThis as unknown as {
  reviewRoomPrisma?: PrismaClient;
};

let productionClient: PrismaClient | undefined;

// Construct only when a server feature asks for the database. Static pages and
// production builds do not require a database or establish connections.
export function getDb() {
  if (globalForPrisma.reviewRoomPrisma) return globalForPrisma.reviewRoomPrisma;
  if (productionClient) return productionClient;
  const { DATABASE_URL } = readDatabaseEnvironment();
  const adapter = new PrismaPg(
    { connectionString: DATABASE_URL, max: 5, connectionTimeoutMillis: 5_000 },
    { schema: "app" },
  );
  const client = new PrismaClient({ adapter });
  if (process.env.NODE_ENV !== "production")
    globalForPrisma.reviewRoomPrisma = client;
  else productionClient = client;
  return client;
}
