import Link from "next/link";
import { versionPage, decisionPage } from "@/lib/data/reviews";
import { VersionControls } from "@/features/reviews/version-controls";
import { VersionComparison } from "@/features/reviews/comparison";
import { DecisionPanel } from "@/features/reviews/decision-panel";
import { UploadPanel } from "@/features/uploads/upload-panel";
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
  searchParams: Promise<{ versionId?: string; compareId?: string }>;
}) {
  const { workspaceId, projectId, assetId } = await params,
    { versionId, compareId } = await searchParams;
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
        userId: user.id,
        versions: await versionPage(
          tx,
          user.id,
          workspaceId,
          projectId,
          assetId,
        ),
        decisions: await decisionPage(
          tx,
          user.id,
          workspaceId,
          projectId,
          assetId,
          data.version.id,
        ),
        comparison:
          compareId && compareId !== data.version.id
            ? (
                await reviewVersion(
                  tx,
                  user.id,
                  workspaceId,
                  projectId,
                  assetId,
                  compareId,
                )
              ).version
            : null,
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
  const {
      asset,
      version,
      project,
      member,
      initial,
      versions,
      decisions,
      comparison,

      userId,
    } = result,
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
      <VersionControls
        key={`${version.id}:${asset.currentVersionId}`}
        base={base}
        currentId={asset.currentVersionId!}
        selected={{
          id: version.id,
          versionNumber: version.versionNumber,
          createdAt: version.createdAt.toISOString(),
          uploader: version.creatorName,
        }}
        initial={versions}
        comparison={
          comparison
            ? {
                id: comparison.id,
                versionNumber: comparison.versionNumber,
                createdAt: comparison.createdAt.toISOString(),
                uploader: comparison.creatorName,
              }
            : undefined
        }
      />
      {comparison ? (
        <VersionComparison
          base={base}
          left={{
            id: version.id,
            number: version.versionNumber,
            width: version.width!,
            height: version.height!,
            uploader: version.creatorName,
          }}
          right={{
            id: comparison.id,
            number: comparison.versionNumber,
            width: comparison.width!,
            height: comparison.height!,
            uploader: comparison.creatorName,
          }}
        />
      ) : (
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
          readOnly={
            !!project.archivedAt || asset.currentVersionId !== version.id
          }
        />
      )}
      <DecisionPanel
        key={`${version.id}:${asset.currentVersionId}:${decisions.history[0]?.id || "none"}`}
        base={base}
        versionId={version.id}
        currentId={asset.currentVersionId!}
        userId={userId}
        canDecide={member.role === "CLIENT"}
        archived={!!project.archivedAt}
        initial={decisions}
      />
      {member.role !== "CLIENT" && !project.archivedAt && (
        <details className="new-version-panel">
          <summary>Upload a new version</summary>
          <UploadPanel
            workspaceId={workspaceId}
            projectId={projectId}
            assetId={assetId}
          />
        </details>
      )}
    </section>
  );
}
