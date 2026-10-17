import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccessError } from "@/lib/auth/errors";
import { getProject } from "@/lib/server/workspaces";
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;
  let project;
  try {
    project = await getProject(workspaceId, projectId);
  } catch (error) {
    if (error instanceof AccessError) {
      if (error.status === 401) redirect("/login");
      notFound();
    }
    throw error;
  }
  return (
    <section className="private-content">
      <Link href={`/app/${workspaceId}/projects`} className="auth-demo-link">
        ← Projects
      </Link>
      <h1>{project.name}</h1>
      <div className="private-empty">
        <p>
          Your project access is verified. Assets and review tools arrive in
          later steps.
        </p>
      </div>
    </section>
  );
}
