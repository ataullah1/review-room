export const productionOrigin = "https://rreviewroom.vercel.app";
// The owner confirmed this previously developmental project now serves the live site.
export const productionSupabaseRef = "pwzwrknnzkdagfcjnqkr";
type Environment = Readonly<Record<string, string | undefined>>;
export function isProductionDeployment(env: Environment = process.env) {
  return env.VERCEL_ENV === "production";
}
export function databaseBelongsToProject(
  value: string | undefined,
  ref: string,
) {
  try {
    const url = new URL(value || "");
    return (
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      (url.hostname === `db.${ref}.supabase.co` ||
        (url.hostname.endsWith(".pooler.supabase.com") &&
          url.username === `postgres.${ref}`)) &&
      ![...url.searchParams.keys()].some((key) =>
        ["host", "hostaddr", "user", "database", "dbname", "service"].includes(
          key,
        ),
      )
    );
  } catch {
    return false;
  }
}
export function assertPreviewIsolation(env: Environment = process.env) {
  if (env.VERCEL_ENV !== "preview") return;
  const ref = env.PREVIEW_SUPABASE_PROJECT_REF;
  if (
    !ref ||
    !/^[a-z0-9]{20}$/.test(ref) ||
    ref === productionSupabaseRef ||
    env.NEXT_PUBLIC_SUPABASE_URL !== `https://${ref}.supabase.co` ||
    !databaseBelongsToProject(env.DATABASE_URL, ref) ||
    (env.DIRECT_URL && !databaseBelongsToProject(env.DIRECT_URL, ref))
  ) {
    throw new Error(
      "Preview backend requires an isolated Supabase project. Production access is disabled.",
    );
  }
}
export function assertHostedTestTarget(env: Environment = process.env) {
  const ref = env.HOSTED_TEST_PROJECT_REF;
  if (
    !ref ||
    !/^[a-z0-9]{20}$/.test(ref) ||
    ref === productionSupabaseRef ||
    env.NEXT_PUBLIC_SUPABASE_URL !== `https://${ref}.supabase.co` ||
    !databaseBelongsToProject(env.DIRECT_URL, ref)
  )
    throw new Error(
      "Hosted acceptance requires a separate non-production Supabase project. The live project is protected.",
    );
}
