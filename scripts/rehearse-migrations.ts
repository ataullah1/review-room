import { config } from "dotenv";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { assertLocalDatabase } from "../prisma/local-safety";
config({ path: ".env", quiet: true });
async function main() {
  const base = new URL(
    assertLocalDatabase(process.env.TEST_DATABASE_URL, "test"),
  );
  const admin = new pg.Client({
    connectionString: base.toString(),
    connectionTimeoutMillis: 5000,
  });
  // The SQL identifier contains only our own fixed prefix and random hex.
  const name = `review_room_rehearsal_${randomUUID().replaceAll("-", "")}`;
  let created = false;
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    const target = new URL(base);
    target.pathname = `/${name}`;
    const result = spawnSync(
      "node_modules/.bin/prisma",
      ["migrate", "deploy"],
      {
        env: {
          ...process.env,
          DATABASE_URL: target.toString(),
          DIRECT_URL: target.toString(),
          NODE_ENV: "test",
        },
        stdio: "inherit",
      },
    );
    if (result.status !== 0) throw new Error("Migration rehearsal failed.");
    const check = new pg.Client({ connectionString: target.toString() });
    await check.connect();
    try {
      const rows = await check.query(
        "SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='app' AND tablename<>'_prisma_migrations'",
      );
      if (rows.rowCount !== 19 || rows.rows.some((row) => !row.rowsecurity))
        throw new Error("Rehearsal schema/RLS mismatch.");
      console.log(
        "Empty local database: all migrations applied; 19 application tables have RLS. No seed or hosted writes.",
      );
    } finally {
      await check.end();
    }
  } finally {
    if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
  }
}
main().catch(() => {
  console.error(
    "Local migration rehearsal failed. No hosted database was selected; inspect the local PostgreSQL setup.",
  );
  process.exitCode = 1;
});
