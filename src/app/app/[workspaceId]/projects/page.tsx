import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccessError } from "@/lib/auth/errors";
import { getWorkspaceProjects } from "@/lib/server/workspaces";
export default async function ProjectsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  let result;
  try {
    result = await getWorkspaceProjects(workspaceId);
  } catch (error) {
    if (error instanceof AccessError) {
      if (error.status === 401) redirect("/login");
      notFound();
    }
    throw error;
  }
  const { workspace, projects, member } = result;
  return (
    <section className="private-content">
      <Link href="/app" className="auth-demo-link">
        ← Your workspaces
      </Link>
      <span className="eyebrow">{member.role.toLowerCase()} · WORKSPACE</span>
      <h1>{workspace.name}</h1>
      <p>
        {member.role === "OWNER"
          ? "All projects in your workspace."
          : "Projects assigned to you."}
      </p>
      {projects.length ? (
        <div className="workspace-list">
          {projects.map((project) => (
            <Link
              key={project.id}
              className="workspace-entry"
              href={`/app/${workspaceId}/projects/${project.id}`}
            >
              <strong>{project.name}</strong>
              <span>{project.archivedAt ? "Archived" : "View project →"}</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="private-empty">
          <h2>
            {member.role === "OWNER"
              ? "Your workspace is ready."
              : "No assigned projects yet."}
          </h2>
          <p>
            {member.role === "OWNER"
              ? "Project creation and team assignment are coming in the next step."
              : "Your workspace owner can assign you to a project."}
          </p>
        </div>
      )}
    </section>
  );
}
