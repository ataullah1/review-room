export const defaultProductionOrigin = "https://rreviewroom.vercel.app";
// The owner confirmed this previously developmental project now serves the live site.
export const ownerProductionSupabaseRef = "pwzwrknnzkdagfcjnqkr";

// Maintained for backward compatibility with existing imports.
export const productionOrigin = defaultProductionOrigin;
export const productionSupabaseRef = ownerProductionSupabaseRef;

type Environment = Readonly<Record<string, string | undefined>>;

export function isProductionDeployment(env: Environment = process.env) {
  return env.VERCEL_ENV === "production";
}

export function readAppOrigin(env: Environment = process.env): string {
  const configured = env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) {
    if (isProductionDeployment(env)) {
      throw Object.assign(
        new Error(
          "NEXT_PUBLIC_APP_URL must be configured for production deployments. See docs/RELEASE.md.",
        ),
        { code: "app_url_missing" },
      );
    }
    return defaultProductionOrigin;
  }
  try {
    const url = new URL(configured);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error();
    }
    return url.origin;
  } catch {
    throw Object.assign(
      new Error(
        "NEXT_PUBLIC_APP_URL must be a valid http or https URL. See .env.example.",
      ),
      { code: "app_url_invalid" },
    );
  }
}

export function readProtectedProductionProjectRef(
  env: Environment = process.env,
): string {
  const ref = env.PRODUCTION_SUPABASE_PROJECT_REF?.trim();
  if (ref) {
    if (!/^[a-z0-9]{20}$/.test(ref)) {
      throw new Error(
        "PRODUCTION_SUPABASE_PROJECT_REF must be a 20-character lowercase alphanumeric project reference.",
      );
    }
    return ref;
  }
  return ownerProductionSupabaseRef;
}

export function extractSupabaseProjectRef(
  value: string | undefined,
): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const match = url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function getProtectedProjectRefs(env: Environment): Set<string> {
  const refs = new Set<string>([ownerProductionSupabaseRef]);
  const custom = env.PRODUCTION_SUPABASE_PROJECT_REF?.trim();
  if (custom && /^[a-z0-9]{20}$/.test(custom)) {
    refs.add(custom);
  }
  return refs;
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

export function assertHostedProjectConsistency(env: Environment = process.env) {
  const deployed =
    env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview";
  if (!deployed) return;
  const authRef = extractSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL);
  if (!authRef) return;
  if (
    env.DATABASE_URL &&
    !databaseBelongsToProject(env.DATABASE_URL, authRef)
  ) {
    throw new Error(
      "Deployed DATABASE_URL does not match the configured Supabase project. Verify database and Auth settings.",
    );
  }
}

export function assertPreviewIsolation(env: Environment = process.env) {
  if (env.VERCEL_ENV !== "preview") return;
  const ref = env.PREVIEW_SUPABASE_PROJECT_REF;
  const protectedRefs = getProtectedProjectRefs(env);
  if (
    !ref ||
    !/^[a-z0-9]{20}$/.test(ref) ||
    protectedRefs.has(ref) ||
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
  const protectedRefs = getProtectedProjectRefs(env);
  if (
    !ref ||
    !/^[a-z0-9]{20}$/.test(ref) ||
    protectedRefs.has(ref) ||
    env.NEXT_PUBLIC_SUPABASE_URL !== `https://${ref}.supabase.co` ||
    !databaseBelongsToProject(env.DIRECT_URL, ref)
  )
    throw new Error(
      "Hosted acceptance requires a separate non-production Supabase project. The live project is protected.",
    );
}
