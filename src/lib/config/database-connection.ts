import type { PoolConfig } from "pg";
import { readDatabaseEnvironment } from "./environment";
export function databaseConnectionOptions(
  env: Readonly<Record<string, string | undefined>> = process.env,
): PoolConfig {
  const { DATABASE_URL } = readDatabaseEnvironment(env);
  const url = new URL(DATABASE_URL),
    ca = env.SUPABASE_DB_CA_CERT?.replaceAll("\\n", "\n").trim();
  const deployed =
    env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview";
  if (
    (deployed && !ca) ||
    (ca &&
      (!ca.startsWith("-----BEGIN CERTIFICATE-----") ||
        !ca.endsWith("-----END CERTIFICATE-----")))
  )
    throw new Error(
      "Configure the Supabase database CA certificate before using the deployed backend.",
    );
  if (ca) {
    // node-postgres URL SSL options override the supplied ssl object. The CA
    // configuration is authoritative; never permit a URL to weaken verification.
    for (const key of [
      "sslmode",
      "sslcert",
      "sslkey",
      "sslrootcert",
      "uselibpqcompat",
    ])
      url.searchParams.delete(key);
  }
  return {
    connectionString: url.toString(),
    max: env.VERCEL === "1" ? 1 : 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    ...(ca ? { ssl: { ca, rejectUnauthorized: true } } : {}),
  };
}
