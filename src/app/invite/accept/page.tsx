import { Brand } from "@/components/brand";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { requireUser } from "@/lib/auth/user";
import { AccessError } from "@/lib/auth/errors";
import { getDb } from "@/lib/server/db";
import { withCapabilityDatabase, inspectInvitation } from "@/lib/data/sharing";
import { limitCapability } from "@/features/sharing/rate-limit";
import { AcceptInvitation } from "@/features/sharing/accept-form";
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function Page() {
  // Establish request-time rendering before a missing deployment setting can fail.
  const requestHeaders = await headers();
  let preview, user;
  try {
    const db = getDb();
    await limitCapability(db, requestHeaders, "read");
    const token = (await cookies()).get("rr_invite")?.value;
    if (!token) throw new AccessError("Open your invitation link again.", 404);
    preview = await withCapabilityDatabase(db, (tx) =>
      inspectInvitation(tx, token),
    );
    try {
      user = await requireUser();
    } catch (error) {
      if (!(error instanceof AccessError && error.status === 401)) throw error;
    }
  } catch (error) {
    return (
      <main className="capability-entry">
        <span className="capability-brand">
          <Brand />
        </span>
        <h1>Invitation unavailable</h1>
        <p>
          {error instanceof AccessError
            ? error.message
            : "Could not load this invitation. Please try again."}
        </p>
      </main>
    );
  }
  return (
    <main className="capability-entry">
      <span className="capability-brand">
        <Brand />
      </span>
      <h1>You’re invited.</h1>
      <h2>{preview.projectName}</h2>
      <p>
        Join as a {preview.role.toLowerCase()}. Use the confirmed email address
        the owner invited.
      </p>
      {user ? (
        <>
          <p>
            Signed in as {user.email}.{" "}
            {!user.emailVerified && "Confirm your email before accepting."}
          </p>
          <AcceptInvitation />
          <Link href="/login?next=%2Finvite%2Faccept">
            Use a different account
          </Link>
        </>
      ) : (
        <>
          <Link
            className="capability-primary-link"
            href="/login?next=%2Finvite%2Faccept"
          >
            Sign in to accept →
          </Link>
          <Link href="/signup?next=%2Finvite%2Faccept">Create an account</Link>
        </>
      )}
    </main>
  );
}
