import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  FolderOpen,
  Plus,
  Search,
  ArrowUpRight,
  Users,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { AccessError } from "@/lib/auth/errors";
import { getWorkspaceProjects } from "@/lib/server/workspaces";
import { projectFilters } from "@/features/projects/validation";
import { Button } from "@/components/ui/button";
export default async function ProjectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{
    q?: string | string[];
    status?: string | string[];
    page?: string | string[];
  }>;
}) {
  const { workspaceId } = await params;
  const filters = projectFilters(await searchParams);
  let result;
  try {
    result = await getWorkspaceProjects(workspaceId, {
      q: filters.q,
      status: filters.status,
      page: String(filters.page),
    });
  } catch (error) {
    if (error instanceof AccessError) {
      if (error.status === 401) redirect("/login");
      notFound();
    }
    throw error;
  }
  const { workspace, projects, member, total, page, pages } = result;
  const base = `/app/${workspaceId}/projects`;
  const listUrl = (status: string, page = 1) =>
    `${base}?${new URLSearchParams({ status, ...(filters.q ? { q: filters.q } : {}), ...(page > 1 ? { page: String(page) } : {}) })}`;
  return (
    <section className="private-content projects-content">
      <Link href="/app" className="auth-demo-link">
        ← Your workspaces
      </Link>
      <div className="projects-heading">
        <div>
          <span className="eyebrow">
            {workspace.name} · {member.role.toLowerCase()}
          </span>
          <h1>Room for your projects.</h1>
          <p>
            {member.role === "OWNER"
              ? "Keep your team, your work, and your feedback together."
              : "Your assigned work, all in one place."}
          </p>
        </div>
        {member.role === "OWNER" && (
          <Button asChild>
            <Link href={`${base}/new`}>
              <Plus size={16} />
              New project
            </Link>
          </Button>
        )}
      </div>
      <div className="projects-toolbar">
        <nav className="project-tabs" aria-label="Project status">
          <Link
            href={listUrl("active")}
            aria-current={filters.status === "active" ? "page" : undefined}
          >
            Active projects
          </Link>
          <Link
            href={listUrl("archived")}
            aria-current={filters.status === "archived" ? "page" : undefined}
          >
            Archived
          </Link>
        </nav>
        <form action={base} className="project-search" role="search">
          <input type="hidden" name="status" value={filters.status} />
          <Search size={16} aria-hidden="true" />
          <input
            aria-label="Search project names"
            name="q"
            defaultValue={filters.q}
            placeholder="Search projects…"
            maxLength={150}
          />
          <button type="submit">Search</button>
        </form>
      </div>
      <p className="project-results" role="status">
        {total} {filters.status === "archived" ? "archived " : ""}
        {total === 1 ? "project" : "projects"}
        {filters.q ? ` matching “${filters.q}”` : ""}
      </p>
      {projects.length ? (
        <div className="project-grid">
          {projects.map((project) => (
            <Link
              key={project.id}
              className="project-card"
              href={`${base}/${project.id}`}
            >
              <div className="project-card-top">
                <span className="project-folder">
                  <FolderOpen size={22} />
                </span>
                <span
                  className={`project-state${project.archivedAt ? " is-archived" : ""}`}
                >
                  {project.archivedAt ? "Archived" : "Active"}
                </span>
              </div>
              <h2>{project.name}</h2>
              <p>
                Created{" "}
                {new Intl.DateTimeFormat("en", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  timeZone: "UTC",
                }).format(project.createdAt)}
              </p>
              <div className="project-card-footer">
                <span>
                  <Users size={14} />
                  {project._count.members} assigned
                </span>
                <ArrowUpRight size={17} aria-hidden="true" />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="private-empty projects-empty">
          <span className="project-folder">
            <FolderOpen size={28} />
          </span>
          <h2>
            {filters.q
              ? "No matching projects."
              : filters.status === "archived"
                ? "Nothing archived yet."
                : member.role === "OWNER"
                  ? "Every good project starts here."
                  : "No assigned projects yet."}
          </h2>
          <p>
            {filters.q
              ? "Try another project name or clear your search."
              : filters.status === "archived"
                ? "Projects you archive will appear here, with their history intact."
                : member.role === "OWNER"
                  ? "Create a project and give your next idea a place to grow."
                  : "Your workspace owner can assign you to a project."}
          </p>
          {filters.q ? (
            <Link
              className="project-text-link"
              href={`${base}?status=${filters.status}`}
            >
              Clear search
            </Link>
          ) : member.role === "OWNER" && filters.status === "active" ? (
            <Button asChild>
              <Link href={`${base}/new`}>
                <Plus size={16} />
                Create your first project
              </Link>
            </Button>
          ) : null}
        </div>
      )}
      {pages > 1 && (
        <nav className="project-pagination" aria-label="Project pages">
          {page > 1 ? (
            <Link href={listUrl(filters.status, page - 1)}>
              <ChevronLeft size={16} />
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span>
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={listUrl(filters.status, page + 1)}>
              Next
              <ChevronRight size={16} />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  );
}
