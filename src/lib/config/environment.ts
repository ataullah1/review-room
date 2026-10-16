import { z } from "zod";

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
  const result = z.object({ DATABASE_URL: postgresUrl }).safeParse(env);
  if (!result.success) {
    // Never include the invalid value or Zod's input payload in an error.
    throw new Error(
      "DATABASE_URL must be configured with a valid PostgreSQL URL. See .env.example.",
    );
  }
  return result.data;
}

export function readStorageEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  const result = z
    .object({
      NEXT_PUBLIC_SUPABASE_URL: z.url(),
      SUPABASE_SECRET_KEY: z.string().min(1),
      SUPABASE_STORAGE_BUCKET: z.literal("review-room-private"),
    })
    .safeParse(env);
  if (!result.success) {
    throw new Error(
      "Development Supabase storage is not configured. Follow docs/RUNBOOK.md; keep secrets in .env.",
    );
  }
  return result.data;
}
