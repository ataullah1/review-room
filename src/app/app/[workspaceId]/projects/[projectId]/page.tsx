import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FolderOpen, Archive } from "lucide-react";
import { AccessError } from "@/lib/auth/errors";
import { getProject } from "@/lib/server/workspaces";
import {
  ProjectPeopleForm,
  ArchiveProjectForm,
} from "@/features/projects/project-forms";
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;
  let result;
  try {
    result = await getProject(workspaceId, projectId);
  } catch (error) {
    if (error instanceof AccessError) {
      if (error.status === 401) redirect("/login");
      notFound();
    }
    throw error;
  }
  const { project, member, people, assignedIds } = result;
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
      {project.archivedAt && (
        <p className="project-notice">
          This project is archived. Its history and people are preserved.
          {member.role === "OWNER"
            ? " Restore it below to manage its people."
            : " Your workspace owner can restore it."}
        </p>
      )}
      <div className="private-empty projects-empty">
        <span className="project-folder">
          <FolderOpen size={26} />
        </span>
        <h2>Your work has a home.</h2>
        <p>
          No assets yet. Image uploads and review tools are coming in the next
          step.
        </p>
      </div>
      {member.role === "OWNER" && (
        <>
          {!project.archivedAt && (
            <ProjectPeopleForm
              workspaceId={workspaceId}
              projectId={projectId}
              people={people}
              assignedIds={assignedIds}
            />
          )}
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
