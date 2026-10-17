import { AuthForm } from "@/components/auth/auth-form";
import { safeReturnPath } from "@/lib/auth/validation";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <AuthForm
      mode="login"
      next={safeReturnPath(next)}
      initialError={
        error === "callback"
          ? "Google sign-in did not finish. Please try again."
          : undefined
      }
    />
  );
}
