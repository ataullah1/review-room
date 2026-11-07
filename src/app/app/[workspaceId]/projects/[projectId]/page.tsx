import { CompletionControls } from "@/features/projects/completion-controls";
import Link from "next/link";
import { ActivityPanel } from "@/features/activity/activity-panel";
import { OwnerLinks } from "@/features/sharing/owner-links";
import Image from "next/image";
import { UploadPanel } from "@/features/uploads/upload-panel";
import { projectFilters } from "@/features/projects/validation";
import { notFound, redirect } from "next/navigation";
import { FolderOpen, Archive } from "lucide-react";
import { AccessError } from "@/lib/auth/errors";
import { getProject } from "@/lib/server/workspaces";
import {
  ProjectPeopleForm,
  ProjectDetailsForm,
  ArchiveProjectForm,
} from "@/features/projects/project-forms";
export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { workspaceId, projectId } = await params;
  let result;
  try {
    result = await getProject(
      workspaceId,
      projectId,
      projectFilters(await searchParams).page,
    );
  } catch (error) {
    if (error instanceof AccessError) {
      if (error.status === 401) redirect("/login");
      notFound();
    }
    throw error;
  }
  const { project, member, people, assignedIds, assetDirectory } = result;
  return (
    <section className="private-content project-editor">
      <Link
        href={`/app/${workspaceId}/projects${project.archivedAt ? "?status=archived" : ""}`}
        className="auth-demo-link"
      >
        ← Projects
      </Link>
      <div className="projects-heading">
        <div>
          <span className="eyebrow">{member.role.toLowerCase()} · PROJECT</span>
          <h1>{project.name}</h1>
        </div>
        <span
          className={`project-state${project.archivedAt ? " is-archived" : ""}`}
        >
          {project.archivedAt ? <Archive size={13} /> : null}
          {project.archivedAt ? "Archived" : "Active"}
        </span>
      </div>
      {project.description && (
        <p style={{ whiteSpace: "pre-wrap" }}>{project.description}</p>
      )}
      {project.dueDate && (
        <p>
          Due{" "}
          <time dateTime={project.dueDate.toISOString().slice(0, 10)}>
            {project.dueDate.toISOString().slice(0, 10)}
          </time>
        </p>
      )}
      {!project.archivedAt && !project.completionId && (
        <nav className="project-notice" aria-label="Project next steps">
          <strong>Next steps</strong>
          <p>
            {member.role === "CLIENT"
              ? "Open a design, pin your feedback, then record your decision on the current version."
              : assetDirectory.total
                ? "Invite your client below, then open a design to review feedback or upload a revision."
                : "Upload your first design, then invite a client to review it."}
          </p>
        </nav>
      )}
      {member.role === "OWNER" &&
        !project.archivedAt &&
        !project.completionId && (
          <ProjectDetailsForm
            workspaceId={workspaceId}
            projectId={projectId}
            name={project.name}
            description={project.description}
            dueDate={project.dueDate?.toISOString().slice(0, 10) || ""}
          />
        )}
      {project.archivedAt && (
        <p className="project-notice">
          This project is archived. Its history and people are preserved.
          {member.role === "OWNER"
            ? " Restore it below to manage its people."
            : " Your workspace owner can restore it."}
        </p>
      )}
      {!project.archivedAt &&
        !project.completionId &&
        (member.role === "OWNER" || member.role === "DESIGNER") && (
          <UploadPanel workspaceId={workspaceId} projectId={projectId} />
        )}
      <div className="asset-section-heading">
        <h2>Project images</h2>
        <span>
          {assetDirectory.total}{" "}
          {assetDirectory.total === 1 ? "image" : "images"}
        </span>
      </div>
      {assetDirectory.assets.length ? (
        <div className="asset-grid">
          {assetDirectory.assets.map((asset) => (
            <Link
              className="asset-card"
              key={asset.id}
              href={`/app/${workspaceId}/projects/${projectId}/assets/${asset.id}?versionId=${asset.currentVersion!.id}`}
            >
              <div className="asset-thumbnail">
                <Image
                  unoptimized
                  src={`/app/${workspaceId}/projects/${projectId}/assets/${asset.id}/file?preview=1`}
                  alt={asset.title}
                  width={asset.currentVersion!.width!}
                  height={asset.currentVersion!.height!}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="asset-card-info">
                <h3>{asset.title}</h3>
                <p>
                  {asset.currentVersion!.width} × {asset.currentVersion!.height}{" "}
                  px ·{" "}
                  {(asset.currentVersion!.fileSize! / 1024 / 1024).toFixed(2)}{" "}
                  MB
                </p>
                <span>Open review →</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="private-empty projects-empty">
          <span className="project-folder">
            <FolderOpen size={26} />
          </span>
          <h2>No images here yet.</h2>
          <p>
            {member.role === "CLIENT"
              ? "Your designer will upload images here for you to view."
              : project.archivedAt
                ? "Restore this project to add images."
                : "Upload an image above to give your team something to look at."}
          </p>
        </div>
      )}
      {assetDirectory.pages > 1 && (
        <nav className="project-pagination" aria-label="Image pages">
          {assetDirectory.page > 1 ? (
            <Link href={`?page=${assetDirectory.page - 1}`}>← Previous</Link>
          ) : (
            <span />
          )}
          <span>
            Page {assetDirectory.page} of {assetDirectory.pages}
          </span>
          {assetDirectory.page < assetDirectory.pages ? (
            <Link href={`?page=${assetDirectory.page + 1}`}>Next →</Link>
          ) : (
            <span />
          )}
        </nav>
      )}
      <CompletionControls
        base={`/app/${workspaceId}/projects/${projectId}`}
        completed={!!project.completionId}
        owner={member.role === "OWNER"}
        archived={!!project.archivedAt}
      />
      <ActivityPanel
        key={projectId}
        workspaceId={workspaceId}
        projectId={projectId}
      />
      {member.role === "OWNER" && (
        <>
          {!project.archivedAt && !project.completionId && (
            <ProjectPeopleForm
              workspaceId={workspaceId}
              projectId={projectId}
              people={people}
              assignedIds={assignedIds}
            />
          )}
          <OwnerLinks
            kind="invite"
            endpoint={`/app/${workspaceId}/projects/${projectId}/invitations`}
            disabled={!!project.archivedAt || !!project.completionId}
          />
          <ArchiveProjectForm
            key={String(!!project.archivedAt)}
            workspaceId={workspaceId}
            projectId={projectId}
            archived={!!project.archivedAt}
          />
        </>
      )}
    </section>
  );
}
