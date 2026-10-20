import { config } from "dotenv";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { databaseConnectionOptions } from "../../src/lib/config/database-connection";
import {
  databaseBelongsToProject,
  productionSupabaseRef,
} from "../../src/lib/config/deployment";
import { existingDemoAccounts } from "../../src/features/reviewer-demo/config";
import {
  demoSeedFiles,
  demoWorkspaceId,
  demoProjects,
  installDemoSeed,
  restoreDemoSeed,
  verifyDemoOwnership,
  type DemoIdentity,
} from "../../src/features/reviewer-demo/seed";

// Explicit operator command for the three public accounts requested by the owner.
// No Auth user is created and no existing password is changed.
config({ path: ".env", quiet: true });
const migration = "20261020001400_reviewer_demo_accounts";
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
async function main() {
  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL !==
    `https://${productionSupabaseRef}.supabase.co`
  )
    throw new Error(
      "This command is restricted to the explicitly configured existing Review Room backend.",
    );
  const checkOnly = process.argv.includes("--check");
  if (
    !checkOnly &&
    process.env.REVIEWER_DEMO_EXISTING_CONFIRM !== productionSupabaseRef
  )
    throw new Error(
      "Set REVIEWER_DEMO_EXISTING_CONFIRM to the existing project reference before running demo:seed-existing. Use --check for a read-only audit.",
    );
  if (
    !process.env.DIRECT_URL ||
    !process.env.SUPABASE_SECRET_KEY ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
    throw new Error(
      "Existing local Supabase credentials and DIRECT_URL are required.",
    );
  if (
    !databaseBelongsToProject(process.env.DIRECT_URL, productionSupabaseRef) ||
    !databaseBelongsToProject(process.env.DATABASE_URL, productionSupabaseRef)
  )
    throw new Error(
      "Existing demo database URLs must match the configured Supabase project.",
    );
  const caPath = resolve(".local/supabase-prod-ca-2021.crt");
  const ca =
    process.env.SUPABASE_DB_CA_CERT || (await readFile(caPath, "utf8"));
  const options = databaseConnectionOptions({
    ...process.env,
    DATABASE_URL: process.env.DIRECT_URL,
    SUPABASE_DB_CA_CERT: ca,
  });
  const sql = new Client(options);
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  let db: PrismaClient | undefined;
  try {
    await sql.connect();
    const expected = existingDemoAccounts.map((a) => a.email);
    const { rows: users } = await sql.query<{
      id: string;
      email: string;
      confirmed: boolean;
    }>(
      `SELECT id,email,email_confirmed_at IS NOT NULL AS confirmed FROM auth.users WHERE lower(email)=ANY($1::text[])`,
      [expected],
    );
    if (users.length !== 3 || users.some((u) => !u.confirmed))
      throw new Error(
        "All three manually created, confirmed demo accounts must exist first. No Auth accounts were created.",
      );
    const { rows: memberships } = await sql.query<{
      userId: string;
      workspaceId: string;
      role: string;
      createdById: string | null;
      projects: number;
      members: number;
    }>(
      `SELECT m."userId",m."workspaceId",m.role,w."createdById",(SELECT count(*)::int FROM app."Project" p WHERE p."workspaceId"=w.id) projects,(SELECT count(*)::int FROM app."Membership" x WHERE x."workspaceId"=w.id) members FROM app."Membership" m JOIN app."Workspace" w ON w.id=m."workspaceId" WHERE m."userId"=ANY($1::uuid[])`,
      [users.map((u) => u.id)],
    );
    for (const row of memberships) {
      if (row.workspaceId === demoWorkspaceId) continue;
      if (
        row.createdById !== row.userId ||
        row.role !== "OWNER" ||
        row.projects !== 0 ||
        row.members !== 1
      )
        throw new Error(
          "A demo account already has non-demo data or shared memberships. Refusing adoption.",
        );
    }
    const { rows: columns } = await sql.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='auth' AND table_name='users'`,
    );
    if (
      [
        "email",
        "email_change",
        "phone",
        "phone_change",
        "encrypted_password",
        "deleted_at",
      ].some((c) => !columns.some((x) => x.column_name === c))
    )
      throw new Error(
        "Supabase Auth schema does not support the demo identity guard.",
      );
    const { rows: applied } = await sql.query<{ migration_name: string }>(
      `SELECT migration_name FROM app._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    if (
      applied.length !==
      (applied.some((m) => m.migration_name === migration) ? 14 : 13)
    )
      throw new Error(
        "Unexpected migration history. Review it before installing the demo.",
      );
    const bucket = process.env.SUPABASE_STORAGE_BUCKET;
    if (bucket !== "review-room-private")
      throw new Error(
        "The existing private review-room-private bucket is required.",
      );
    const { data: bucketInfo, error: bucketError } =
      await admin.storage.getBucket(bucket);
    if (bucketError || !bucketInfo || bucketInfo.public)
      throw new Error(
        "Demo assets require the existing private storage bucket.",
      );
    const files = await demoSeedFiles(readFile);
    for (const account of existingDemoAccounts) {
      const client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const { data, error } = await client.auth.signInWithPassword({
        email: account.email,
        password: account.password,
      });
      if (
        error ||
        data.user?.id !== users.find((u) => u.email === account.email)?.id
      )
        throw new Error(
          `${account.role} demo credentials could not authenticate. No password was changed.`,
        );
      await client.auth.signOut({ scope: "local" });
    }
    if (checkOnly) {
      console.log(
        JSON.stringify({
          status: "preflight-passed",
          accounts: users.map((u) => u.email),
          memberships: memberships.length,
          assets: files.length,
          migrationApplied: applied.some((m) => m.migration_name === migration),
        }),
      );
      return;
    }
    await mkdir(".local", { recursive: true });
    await writeFile(
      `.local/reviewer-demo-before-${Date.now()}.json`,
      JSON.stringify({ users, memberships }, null, 2),
      { mode: 0o600 },
    );
    if (!applied.some((m) => m.migration_name === migration)) {
      const direct = new URL(process.env.DIRECT_URL);
      direct.searchParams.set("sslmode", "verify-full");
      // Prisma CLI reads the CA from a file, whereas the runtime accepts PEM text.
      await writeFile(".local/reviewer-demo-db-ca.crt", ca, { mode: 0o600 });
      direct.searchParams.set(
        "sslrootcert",
        resolve(".local/reviewer-demo-db-ca.crt"),
      );
      const result = spawnSync(
        "node_modules/.bin/prisma",
        ["migrate", "deploy"],
        {
          env: { ...process.env, DIRECT_URL: direct.toString() },
          encoding: "utf8",
        },
      );
      if (result.status !== 0)
        throw new Error(
          "Reviewer demo migration failed. Inspect migration status privately; no seed records were written.",
        );
      console.log("Applied the reviewer demo protection migration.");
    }
    db = new PrismaClient({
      adapter: new PrismaPg(options, { schema: "app" }),
    });
    const identities: DemoIdentity[] = [];
    for (const account of existingDemoAccounts) {
      const user = users.find((u) => u.email === account.email)!;
      const legacy = await db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${user.id},0))::text`;
          await tx.userProfile.upsert({
            where: { id: user.id },
            update: {},
            create: {
              id: user.id,
              displayName: `${account.role === "OWNER" ? "Creator" : account.role === "DESIGNER" ? "Designer" : "Client"} Demo`,
            },
          });
          const found = await tx.workspace.findUnique({
            where: { createdById: user.id },
          });
          if (found) return found;
          const workspace = await tx.workspace.create({
            data: {
              name: `${account.role} Demo / personal`,
              createdById: user.id,
            },
          });
          await tx.membership.create({
            data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" },
          });
          return workspace;
        },
        { maxWait: 15_000, timeout: 30_000 },
      );
      identities.push({
        id: user.id,
        email: account.email,
        role: account.role,
        legacyWorkspaceId: legacy.id,
      });
    }
    await verifyDemoOwnership(db, identities);
    if (process.argv.includes("--restore")) {
      if (process.env.REVIEWER_DEMO_RESTORE_CONFIRM !== demoWorkspaceId)
        throw new Error(
          "Restore requires the exact demo workspace confirmation. No content was reset.",
        );
      const keys = await restoreDemoSeed(db, identities);
      const extras = keys.filter(
        (k) =>
          !files.some((f) => f.key === k) &&
          (k.startsWith(`${demoWorkspaceId}/`) ||
            k.startsWith(`_pending/${demoWorkspaceId}/`)),
      );
      if (extras.length) {
        const { error } = await admin.storage.from(bucket).remove(extras);
        if (error)
          throw new Error(
            "Demo-only extra object cleanup failed; rerun restore.",
          );
      }
    }
    for (const file of files) {
      const { data, error } = await admin.storage
        .from(bucket)
        .download(file.key);
      if (data) {
        if (
          hash(Buffer.from(await data.arrayBuffer())) !==
          file.metadata.contentHash
        )
          throw new Error(
            "An existing seed object differs. Refusing overwrite.",
          );
      } else {
        if (
          error &&
          !["400", "404"].includes(
            String("statusCode" in error ? error.statusCode : ""),
          )
        )
          throw new Error("Could not check demo storage object.");
        const { error: uploadError } = await admin.storage
          .from(bucket)
          .upload(file.key, file.bytes, {
            contentType: file.mimeType,
            upsert: false,
          });
        if (uploadError)
          throw new Error(
            "Could not upload a demo image. Rerun the idempotent command.",
          );
      }
    }
    const result = await installDemoSeed(db, identities, files);
    console.log(
      JSON.stringify({
        status: result.created ? "installed" : "verified",
        workspaceId: result.workspaceId,
        accounts: identities.map((u) => ({ email: u.email, role: u.role })),
        projects: demoProjects.length,
        versions: files.length,
        comments: 8,
        decisions: 4,
      }),
    );
  } finally {
    await db?.$disconnect();
    await sql.end();
  }
}
main().catch((error: unknown) => {
  if (
    error instanceof Error &&
    !/postgres(?:ql)?:\/\/|sb_secret_|eyJ|password=|prisma\./i.test(
      error.message,
    )
  )
    console.error(error.message);
  console.error(
    "Existing-account demo setup stopped. Check account availability, private database configuration and migration prerequisites; no secrets are printed.",
  );
  process.exitCode = 1;
});
