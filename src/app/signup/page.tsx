import { AuthForm } from "@/components/auth/auth-form";
import { safeReturnPath } from "@/lib/auth/validation";
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <AuthForm mode="signup" next={safeReturnPath(next)} />;
}
