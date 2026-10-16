import { config } from "dotenv";
import { spawnSync } from "node:child_process";
import { assertLocalDatabase } from "../prisma/local-safety";

config({ path: ".env", quiet: true });
try {
  const connectionString = assertLocalDatabase(
    process.env.TEST_DATABASE_URL,
    "test",
  );
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "test",
    DIRECT_URL: connectionString,
    DATABASE_URL: connectionString,
    TEST_DATABASE_URL: connectionString,
  };
  // No resets: apply versioned migrations only, then test in the dedicated test DB.
  for (const [binary, args] of [
    ["node_modules/.bin/prisma", ["migrate", "deploy"]],
    ["node_modules/.bin/vitest", ["run", "tests/integration"]],
  ] as const) {
    const result = spawnSync(binary, args, { env, stdio: "inherit" });
    if (result.status !== 0) {
      process.exitCode = 1;
      break;
    }
  }
} catch {
  console.error(
    "Integration tests require the dedicated local review_room_test database. Run pnpm db:local:start.",
  );
  process.exitCode = 1;
}
