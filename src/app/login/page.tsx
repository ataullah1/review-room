import { demoWorkspaceId } from "@/features/reviewer-demo/seed";
import { getDb } from "@/lib/server/db";
import { publicDemoAccounts } from "@/features/reviewer-demo/config";
import { AuthForm } from "@/components/auth/auth-form";
import { safeReturnPath } from "@/lib/auth/validation";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; reset?: string }>;
}) {
  const { next, error, reset } = await searchParams;
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
      initialSuccess={
        reset === "success"
          ? "Password updated successfully. Please sign in with your new password."
          : undefined
      }
      initialError={
        error === "callback"
          ? "Google sign-in did not finish. Please try again."
          : error === "verification"
            ? "The verification link is invalid or has expired. Please sign in or request a new link."
            : error === "recovery"
              ? "The password reset link is invalid or has expired. Please request a new one."
              : undefined
      }
    />
  );
}
