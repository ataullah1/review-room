import { config } from "dotenv";
import pg from "pg";
import {
  readDatabaseEnvironment,
  readStorageEnvironment,
} from "../src/lib/config/environment";

config({ path: ".env", quiet: true });

class CheckError extends Error {}
function requireCheck(condition: unknown, message: string): asserts condition {
  if (!condition) throw new CheckError(message);
}
async function request(
  url: URL,
  key?: string,
  extraHeaders: Record<string, string> = {},
) {
  return fetch(url, {
    headers: { ...(key ? { apikey: key } : {}), ...extraHeaders },
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
}

async function checkDatabase(
  connectionString: string,
  label: string,
  inspectPermissions = false,
) {
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 15_000,
    query_timeout: 15_000,
  });
  try {
    await client.connect();
    const tables = await client.query<{
      tablename: string;
      rowsecurity: boolean;
    }>(`
      SELECT tablename, rowsecurity FROM pg_tables
      WHERE schemaname = 'app' AND tablename <> '_prisma_migrations'
    `);
    const expected = [
      "UserProfile",
      "Workspace",
      "Membership",
      "Project",
      "ProjectMember",
      "Asset",
      "AssetVersion",
    ];
    requireCheck(
      expected.every((name) =>
        tables.rows.some(
          (table) => table.tablename === name && table.rowsecurity,
        ),
      ),
      `${label}: expected application tables with RLS are missing.`,
    );
    const migrations = await client.query<{ pending: number }>(`
      SELECT COUNT(*)::int AS pending FROM app._prisma_migrations
      WHERE finished_at IS NULL AND rolled_back_at IS NULL
    `);
    requireCheck(
      migrations.rows[0].pending === 0,
      `${label}: an unfinished migration exists.`,
    );
    console.log(`${label}: connected; foundation tables and RLS verified.`);
    if (inspectPermissions) {
      const grants = await client.query<{
        role: string;
        schema_usage: boolean;
        table_access: boolean;
      }>(`
        SELECT rolname AS role,
          has_schema_privilege(oid, 'app', 'USAGE') AS schema_usage,
          EXISTS (
            SELECT 1 FROM pg_tables t WHERE t.schemaname = 'app'
            AND has_table_privilege(r.oid, format('%I.%I', t.schemaname, t.tablename),
              'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          ) AS table_access
        FROM pg_roles r WHERE rolname IN ('anon', 'authenticated')
      `);
      requireCheck(
        grants.rows.length === 2 &&
          grants.rows.every((role) => !role.schema_usage && !role.table_access),
        "Browser roles still have application access.",
      );
      for (const role of ["anon", "authenticated"] as const) {
        await client.query("BEGIN");
        let denied = false;
        try {
          await client.query(`SET LOCAL ROLE ${role}`);
          await client.query('SELECT 1 FROM app."Workspace" LIMIT 1');
        } catch (error) {
          denied = (error as { code?: string }).code === "42501";
        } finally {
          await client.query("ROLLBACK");
        }
        requireCheck(
          denied,
          `${role}: direct application read was not denied.`,
        );
      }
      console.log(
        "anon/authenticated: application read/write grants absent; direct reads denied.",
      );
      const requestRole = await client.query<{
        rolbypassrls: boolean;
        rolsuper: boolean;
        rolcanlogin: boolean;
      }>(
        "SELECT rolbypassrls, rolsuper, rolcanlogin FROM pg_roles WHERE rolname = 'review_room_user'",
      );
      requireCheck(
        requestRole.rows.length === 1 &&
          requestRole.rows.every(
            (role) => !role.rolbypassrls && !role.rolsuper && !role.rolcanlogin,
          ),
        "Application request role must not bypass RLS.",
      );
      const hook = await client.query<{
        installed: boolean;
        allowed: boolean;
        browser_denied: boolean;
      }>(`
        SELECT to_regprocedure('app.before_user_created(jsonb)') IS NOT NULL AS installed,
          has_function_privilege('supabase_auth_admin', 'app.before_user_created(jsonb)', 'EXECUTE') AS allowed,
          NOT has_function_privilege('anon', 'app.before_user_created(jsonb)', 'EXECUTE')
          AND NOT has_function_privilege('authenticated', 'app.before_user_created(jsonb)', 'EXECUTE') AS browser_denied
      `);
      requireCheck(
        hook.rows[0]?.installed &&
          hook.rows[0].allowed &&
          hook.rows[0].browser_denied,
        "Signup hook SQL or grants are missing.",
      );
      console.log(
        "Request role: RLS enforced. Signup hook function/grants installed; Dashboard hook activation must be verified separately.",
      );
    }
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  const { DATABASE_URL } = readDatabaseEnvironment();
  const storage = readStorageEnvironment();
  const base = new URL(storage.NEXT_PUBLIC_SUPABASE_URL);
  requireCheck(
    base.protocol === "https:" &&
      /^[a-z0-9]+\.supabase\.co$/.test(base.hostname),
    "Use the hosted development Supabase project URL.",
  );
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  requireCheck(publishableKey, "Supabase publishable key is missing.");
  requireCheck(process.env.DIRECT_URL, "DIRECT_URL is missing.");

  // Sequential to keep each verification result clear. No migration, upload,
  // account creation or fixture write is performed by this command.
  await checkDatabase(DATABASE_URL, "Runtime database");
  await checkDatabase(process.env.DIRECT_URL, "Migration database", true);

  const authResponse = await request(
    new URL("/auth/v1/settings", base),
    publishableKey,
  );
  requireCheck(
    authResponse.ok,
    `Publishable key check failed (HTTP ${authResponse.status}).`,
  );
  const auth = await authResponse.json();
  requireCheck(
    auth.external?.email === true && auth.mailer_autoconfirm === true,
    "Immediate signup requires Confirm email OFF: Authentication > Sign In / Providers > Email > Confirm email.",
  );
  console.log(
    "Publishable key: valid; email sign-in enabled and confirmation disabled.",
  );

  const apiResponse = await request(
    new URL("/rest/v1/Workspace?select=id&limit=1", base),
    publishableKey,
    { "Accept-Profile": "app" },
  );
  requireCheck(
    !apiResponse.ok,
    "Application schema is accessible through the public Data API.",
  );
  const apiError = await apiResponse.json().catch(() => ({}));
  requireCheck(
    apiError.code === "PGRST106",
    "Could not verify that app is excluded from exposed Data API schemas.",
  );
  console.log("Data API: app schema is excluded from exposed schemas.");

  const bucketResponse = await request(
    new URL(`/storage/v1/bucket/${storage.SUPABASE_STORAGE_BUCKET}`, base),
    storage.SUPABASE_SECRET_KEY,
  );
  requireCheck(
    bucketResponse.ok,
    `Private bucket lookup failed (HTTP ${bucketResponse.status}).`,
  );
  const bucket = await bucketResponse.json();
  requireCheck(
    bucket.id === storage.SUPABASE_STORAGE_BUCKET && bucket.public === false,
    "Review Room bucket is missing or public.",
  );
  requireCheck(
    Number(bucket.file_size_limit) === 10_485_760,
    "Bucket file-size limit must be 10 MiB.",
  );
  const allowed = bucket.allowed_mime_types as string[] | undefined;
  requireCheck(
    allowed?.length === 3 &&
      ["image/jpeg", "image/png", "image/webp"].every((mime) =>
        allowed.includes(mime),
      ),
    "Bucket image MIME allowlist differs from the roadmap.",
  );
  console.log(
    "Secret key: valid; private bucket, 10 MiB limit and image MIME allowlist verified.",
  );
  console.log(
    "Supabase foundation checks passed. No secret values were printed.",
  );
}

main().catch((error: unknown) => {
  // Never print provider errors, URLs or response bodies containing credentials.
  console.error(
    error instanceof CheckError
      ? error.message
      : "Supabase check failed. Verify environment, network and server logs; credentials are not logged.",
  );
  process.exitCode = 1;
});
