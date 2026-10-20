import { demoWorkspaceId } from "@/features/reviewer-demo/seed";
import { getDb } from "@/lib/server/db";
import { publicDemoAccounts } from "@/features/reviewer-demo/config";
import { AuthForm } from "@/components/auth/auth-form";
import { safeReturnPath } from "@/lib/auth/validation";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  let demoAccounts = publicDemoAccounts();
  if (demoAccounts.length) {
    try {
      if (
        (await getDb().reviewerDemoAccount.count({
          where: { workspaceId: demoWorkspaceId },
        })) !== 3
      )
        demoAccounts = [];
    } catch {
      demoAccounts = [];
    }
  }
  return (
    <AuthForm
      mode="login"
      demoAccounts={demoAccounts}
      next={safeReturnPath(next)}
      initialError={
        error === "callback"
          ? "Google sign-in did not finish. Please try again."
          : undefined
      }
    />
  );
}
