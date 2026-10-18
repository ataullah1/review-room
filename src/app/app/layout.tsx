import { Brand } from "@/components/brand";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/user";
import { AccessError } from "@/lib/auth/errors";
import { SessionButton } from "@/components/auth/auth-form";
export const dynamic = "force-dynamic";
export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireUser();
  } catch (error) {
    if (error instanceof AccessError && error.status === 401)
      redirect("/login");
    throw error;
  }
  return (
    <div className="private-app">
      <header>
        <Link href="/app" className="brand">
          <Brand />
        </Link>
        <SessionButton />
      </header>
      {children}
    </div>
  );
}
