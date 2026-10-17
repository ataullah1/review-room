import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccessError } from "@/lib/auth/errors";
import { getProjectCreation } from "@/lib/server/workspaces";
import { CreateProjectForm } from "@/features/projects/project-forms";
export default async function NewProjectPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  let result;
  try {
    result = await getProjectCreation(workspaceId);
  } catch (error) {
    if (error instanceof AccessError) {
      if (error.status === 401) redirect("/login");
      notFound();
    }
    throw error;
  }
  return (
    <section className="private-content project-editor">
      <Link className="auth-demo-link" href={`/app/${workspaceId}/projects`}>
        ← Projects
      </Link>
      <span className="eyebrow">{result.workspace.name}</span>
      <h1>A new place for great work.</h1>
      <p>Name your project and choose who will be part of it.</p>
      <CreateProjectForm
        workspaceId={workspaceId}
        requestId={randomUUID()}
        people={result.people}
      />
    </section>
  );
}
