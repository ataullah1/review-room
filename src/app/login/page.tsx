import { AuthForm } from "@/components/auth/auth-form";
import { safeReturnPath } from "@/lib/auth/validation";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <AuthForm mode="login" next={safeReturnPath(next)} />;
}
