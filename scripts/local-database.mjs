import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";

// Own cluster, own port, loopback only. Never connects to the host's default database.
const directory = resolve(".local/postgres");
const log = resolve(".local/postgres.log");
const port = "55432";
function command(name, args, optional = false) {
  const result = spawnSync(name, args, { encoding: "utf8" });
  if (result.error)
    throw new Error(
      `${name} is unavailable. Install PostgreSQL 18 and add its bin directory to PATH.`,
    );
  if (!optional && result.status !== 0)
    throw new Error(
      `${name} failed. Check .local/postgres.log and PostgreSQL availability.`,
    );
  return result;
}
try {
  const action = process.argv[2];
  if (!["start", "stop"].includes(action))
    throw new Error("Use start or stop.");
  mkdirSync(resolve(".local"), { recursive: true });
  const initialized = existsSync(resolve(directory, "PG_VERSION"));
  const running =
    initialized &&
    command("pg_ctl", ["-D", directory, "status"], true).status === 0;
  if (action === "stop") {
    if (running)
      command("pg_ctl", ["-D", directory, "-m", "fast", "-w", "stop"]);
    console.log(
      "Review Room local database is stopped. Data is retained in .local/postgres.",
    );
  } else {
    if (!running) {
      const check = command(
        "pg_isready",
        ["-h", "127.0.0.1", "-p", port],
        true,
      );
      if (check.status !== 2)
        throw new Error(
          "Port 55432 is already occupied; no existing server was changed.",
        );
      if (!initialized)
        command("initdb", [
          "-D",
          directory,
          "--username=review_room_local",
          "--auth-local=trust",
          "--auth-host=trust",
          "--encoding=UTF8",
          "--locale=C",
        ]);
      command("pg_ctl", [
        "-D",
        directory,
        "-l",
        log,
        "-o",
        "-h 127.0.0.1 -p 55432 -k /tmp",
        "-w",
        "start",
      ]);
    }
    for (const database of ["review_room_dev", "review_room_test"]) {
      const result = command("psql", [
        "-h",
        "127.0.0.1",
        "-p",
        port,
        "-U",
        "review_room_local",
        "-d",
        "postgres",
        "-Atc",
        `SELECT 1 FROM pg_database WHERE datname = '${database}'`,
      ]);
      if (result.stdout.trim() !== "1")
        command("createdb", [
          "-h",
          "127.0.0.1",
          "-p",
          port,
          "-U",
          "review_room_local",
          database,
        ]);
    }
    if (!existsSync(".env")) copyFileSync(".env.example", ".env");
    console.log(
      "Review Room PostgreSQL ready on 127.0.0.1:55432. Existing .env and other databases were preserved.",
    );
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Local database setup failed.",
  );
  process.exitCode = 1;
}
