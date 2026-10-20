import { Brand } from "@/components/brand";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/user";
import { AccessError } from "@/lib/auth/errors";
import { isExistingDemoEmail } from "@/features/reviewer-demo/config";
import { getDb } from "@/lib/server/db";
import { withUserDatabase } from "@/lib/data/context";
import { SessionButton } from "@/components/auth/auth-form";
export const dynamic = "force-dynamic";
export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let demo = false;
  try {
    const user = await requireUser();
    demo =
      isExistingDemoEmail(user.email) &&
      !!(await withUserDatabase(getDb(), user.id, (tx) =>
        tx.reviewerDemoAccount.findUnique({
          where: { userId: user.id },
          select: { workspaceId: true },
        }),
      ));
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
      {demo && (
        <aside className="reviewer-demo-notice" role="note">
          <strong>Shared reviewer demo</strong> · Real workspace, sample data.
          Management, invitations and sharing are read only. Uploads and review
          actions are limited. Do not enter private information.
        </aside>
      )}
      {children}
    </div>
  );
}
