import { productionSupabaseRef } from "../../lib/config/deployment";
export type PublicDemoAccount = {
  role: "OWNER" | "DESIGNER" | "CLIENT";
  email: string;
  password: string;
};
// These are intentionally PUBLIC credentials supplied for the marketplace demo.
// They confer only existing workspace roles, never Supabase admin privileges.
export const existingDemoAccounts: PublicDemoAccount[] = [
  { role: "OWNER", email: "demo@admin.com", password: "0123456789" },
  { role: "DESIGNER", email: "demo@designer.com", password: "0123456789" },
  { role: "CLIENT", email: "demo@client.com", password: "0123456789" },
];
export function isExistingDemoEmail(email: string | undefined): boolean {
  return (
    !!email &&
    existingDemoAccounts.some(
      (account) => account.email === email.toLowerCase(),
    )
  );
}

export function publicDemoAccounts(
  env: Readonly<Record<string, string | undefined>> = process.env,
): PublicDemoAccount[] {
  if (
    env.REVIEWER_DEMO_ENABLED === "false" ||
    env.NEXT_PUBLIC_SUPABASE_URL !==
      `https://${productionSupabaseRef}.supabase.co`
  )
    return [];
  const privateValues = [
    env.SUPABASE_SECRET_KEY,
    env.SIGNUP_RATE_LIMIT_SECRET,
    env.CRON_SECRET,
    env.DATABASE_URL,
    env.DIRECT_URL,
  ].filter(Boolean);
  if (existingDemoAccounts.some((a) => privateValues.includes(a.password)))
    throw new Error("Public demo passwords must not reuse server secrets.");
  return existingDemoAccounts.map((a) => ({ ...a }));
}
