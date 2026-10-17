import { z } from "zod";
export const loginSchema = z.object({
  email: z.email().trim().toLowerCase().max(254),
  password: z.string().min(1).max(128),
});
export const signupSchema = loginSchema.extend({
  displayName: z.string().trim().min(2).max(80),
  password: z.string().min(10).max(128),
});
export function safeReturnPath(value: string | null | undefined) {
  if (value === "/invite/accept") return value;
  return value && /^\/app(?:\/[a-zA-Z0-9_-]+)*\/?$/.test(value)
    ? value
    : "/app";
}
export function requireSameOrigin(
  headers: Pick<Headers, "get">,
  env: Record<string, string | undefined> = process.env,
) {
  const origin = headers.get("origin");
  const allowed = new Set<string>();
  if (env.NEXT_PUBLIC_APP_URL)
    allowed.add(new URL(env.NEXT_PUBLIC_APP_URL).origin);
  if (env.VERCEL === "1" && env.VERCEL_URL)
    allowed.add(`https://${env.VERCEL_URL}`);
  return origin !== null && allowed.has(origin);
}
