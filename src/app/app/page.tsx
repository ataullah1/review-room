import Link from "next/link";
import { redirect } from "next/navigation";
import { AccessError } from "@/lib/auth/errors";
import { getUserWorkspaces } from "@/lib/server/workspaces";
import { SessionButton } from "@/components/auth/auth-form";
export default async function WorkspacePage() {
  let result;
  try {
    result = await getUserWorkspaces();
  } catch (error) {
    if (error instanceof AccessError && error.status === 401)
      redirect("/login");
    throw error;
  }
  const { user, memberships } = result;
  return (
    <section className="private-content">
      <span className="eyebrow">YOUR WORKSPACES</span>
      <h1>A space for your work.</h1>
      <p>Signed in as {user.email}</p>
      {memberships.length ? (
        <div className="workspace-list">
          {memberships.map(({ workspace, role }) => (
            <Link
              className="workspace-entry"
              key={workspace.id}
              href={`/app/${workspace.id}/projects`}
            >
              <strong>{workspace.name}</strong>
              <span>{role.toLowerCase()} →</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="private-empty">
          <h2>Let’s finish setting up your workspace.</h2>
          <p>
            Your account is signed in. Retry setup to create your workspace.
          </p>
          <SessionButton operation="bootstrap" />
        </div>
      )}
    </section>
  );
}
