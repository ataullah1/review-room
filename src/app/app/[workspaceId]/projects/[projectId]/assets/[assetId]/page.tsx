import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/user";
import { AccessError } from "@/lib/auth/errors";
import { withUserDatabase } from "@/lib/data/context";
import { getDb } from "@/lib/server/db";
import { reviewVersion, threadPage } from "@/lib/data/comments";
import { ReviewWorkspace } from "@/features/comments/review-workspace";
export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; projectId: string; assetId: string }>;
  searchParams: Promise<{ versionId?: string }>;
}) {
  const { workspaceId, projectId, assetId } = await params,
    { versionId } = await searchParams;
  let result;
  try {
    const user = await requireUser();
    result = await withUserDatabase(getDb(), user.id, async (tx) => {
      const data = await reviewVersion(
        tx,
        user.id,
        workspaceId,
        projectId,
        assetId,
        versionId,
      );
      return {
        ...data,
        initial: await threadPage(
          tx,
          user.id,
          workspaceId,
          projectId,
          assetId,
          data.version.id,
        ),
      };
    });
  } catch (error) {
    if (error instanceof AccessError) {
      if (error.status === 401) redirect("/login");
      notFound();
    }
    throw error;
  }
  const { asset, version, project, member, initial } = result,
    base = `/app/${workspaceId}/projects/${projectId}/assets/${assetId}`;
  return (
    <section className="image-review-page">
      <div className="image-review-heading">
        <div>
          <Link
            href={`/app/${workspaceId}/projects/${projectId}`}
            className="review-back"
          >
            ← {project.name}
          </Link>
          <h1>{asset.title}</h1>
        </div>
        <span className="project-state">
          Version {version.versionNumber}
          {project.archivedAt ? " · Archived" : ""}
        </span>
      </div>
      <ReviewWorkspace
        key={version.id}
        base={base}
        versionId={version.id}
        imageUrl={`${base}/file?versionId=${version.id}`}
        title={asset.title}
        width={version.width!}
        height={version.height!}
        initial={initial}
        canResolve={member.role !== "CLIENT"}
        readOnly={!!project.archivedAt}
      />
    </section>
  );
}
