import { cookies, headers } from "next/headers";
import { getDb } from "@/lib/server/db";
import { AccessError } from "@/lib/auth/errors";
import {
  withCapabilityDatabase,
  readShare,
  sharedComments,
} from "@/lib/data/sharing";
import { limitCapability } from "@/features/sharing/rate-limit";
import { ReviewWorkspace } from "@/features/comments/review-workspace";
import type { ThreadPage } from "@/features/comments/types";
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function Page({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  let data;
  const { shareId } = await params;
  try {
    const db = getDb();
    await limitCapability(db, await headers(), "read");
    const token = (await cookies()).get("rr_share")?.value;
    if (!token) throw new AccessError("Open the full share link again.", 404);
    data = await withCapabilityDatabase(db, async (tx) => ({
      version: await readShare(tx, shareId, token),
      initial: await sharedComments<ThreadPage>(tx, shareId, token),
    }));
  } catch (error) {
    return (
      <main className="capability-entry">
        <h1>Share unavailable</h1>
        <p>
          {error instanceof AccessError
            ? error.message
            : "Could not load this image. Please try again."}
        </p>
      </main>
    );
  }
  const { version, initial } = data,
    base = `/share/view/${shareId}`;
  return (
    <main className="shared-review">
      <header>
        <span className="capability-brand">review room.</span>
        <span>Shared for viewing · read only</span>
      </header>
      <div className="image-review-heading">
        <h1>{version.title}</h1>
        <span className="project-state">Version {version.versionNumber}</span>
      </div>
      <p className="shared-notice">
        This link shows only this image version and its feedback. Comments and
        review decisions are disabled.
      </p>
      <ReviewWorkspace
        base={base}
        feedbackUrl={`${base}/comments`}
        versionId={version.versionId}
        imageUrl={`${base}/file?preview=1`}
        title={version.title}
        width={version.width}
        height={version.height}
        initial={initial}
        canResolve={false}
        readOnly
      />
    </main>
  );
}
