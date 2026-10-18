import { z } from "zod";
import { assertPreviewIsolation } from "./deployment";

const postgresUrl = z
  .string()
  .min(1)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        ["postgres:", "postgresql:"].includes(url.protocol) &&
        Boolean(url.hostname) &&
        url.pathname.length > 1
      );
    } catch {
      return false;
    }
  }, "A PostgreSQL connection URL is required");

export function readDatabaseEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  assertPreviewIsolation(env);
  const value = env.DATABASE_URL;
  const result = z.object({ DATABASE_URL: postgresUrl }).safeParse({
    DATABASE_URL: value,
  });
  if (!result.success) {
    // Never include the invalid value or Zod's input payload in an error.
    // Fixed categories distinguish deployment mistakes without exposing any URL.
    let code = "database_url_invalid";
    if (value === undefined) code = "database_url_missing";
    else if (!value.trim()) code = "database_url_empty";
    else if (/^DATABASE_URL\s*=/.test(value.trim()))
      code = "database_url_assignment";
    else if (/^["']/.test(value.trim())) code = "database_url_quoted";
    else if (!/^postgres(?:ql)?:\/\//.test(value.trim()))
      code = "database_url_protocol";
    throw Object.assign(
      new Error(
        "DATABASE_URL must be configured with a valid PostgreSQL URL. See .env.example.",
      ),
      { code },
    );
  }
  return result.data;
}

export function readStorageEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  assertPreviewIsolation(env);
  const result = z
    .object({
      NEXT_PUBLIC_SUPABASE_URL: z.url(),
      SUPABASE_SECRET_KEY: z.string().min(1),
      SUPABASE_STORAGE_BUCKET: z.literal("review-room-private"),
    })
    .safeParse(env);
  if (!result.success) {
    throw new Error(
      "Supabase storage is not configured. Follow docs/RUNBOOK.md; keep secrets in .env.",
    );
  }
  return result.data;
}
