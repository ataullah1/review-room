"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Archive, RotateCcw, Users } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { mutateProject } from "./actions";
type Person = { userId: string; role: string; user: { displayName: string } };
function PeoplePicker({
  people,
  assignedIds = [],
  disabled,
}: {
  people: Person[];
  assignedIds?: string[];
  disabled: boolean;
}) {
  return (
    <fieldset className="project-people-picker" disabled={disabled}>
      <legend>
        <Users size={16} /> Project people
      </legend>
      <p>
        Only assigned designers and clients can access this project. Owners
        always have access.
      </p>
      {people.length ? (
        <div className="project-people-options">
          {people.map((person) => (
            <label key={person.userId} className="project-person-option">
              <input
                type="checkbox"
                name="memberIds"
                value={person.userId}
                defaultChecked={assignedIds.includes(person.userId)}
              />
              <span className="project-avatar" aria-hidden="true">
                {person.user.displayName.slice(0, 1).toUpperCase()}
              </span>
              <span>
                <strong>{person.user.displayName}</strong>
                <small>{person.role.toLowerCase()}</small>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <div className="project-people-empty">
          No designers or clients in this workspace yet. You can create a
          project now and assign existing members later.
        </div>
      )}
    </fieldset>
  );
}
export function CreateProjectForm({
  workspaceId,
  requestId,
  people,
}: {
  workspaceId: string;
  requestId: string;
  people: Person[];
}) {
  const [state, action, pending] = useActionState(
    mutateProject.bind(null, workspaceId, null, "create"),
    {},
  );
  const router = useRouter();
  useEffect(() => {
    if (state.projectId)
      router.push(`/app/${workspaceId}/projects/${state.projectId}`);
  }, [state.projectId, workspaceId, router]);
  return (
    <form action={action} className="project-form" aria-busy={pending}>
      <input type="hidden" name="requestId" value={requestId} />
      <label className="project-field">
        Project name
        <input
          name="name"
          required
          minLength={2}
          maxLength={150}
          placeholder="e.g. Summer brand campaign"
          autoComplete="off"
          disabled={pending}
        />
      </label>
      <PeoplePicker people={people} disabled={pending} />
      {state.error && (
        <p className="auth-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="project-form-footer">
        <Link href={`/app/${workspaceId}/projects`}>Cancel</Link>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create project"}
          <ArrowRight size={16} />
        </Button>
      </div>
    </form>
  );
}
export function ProjectPeopleForm({
  workspaceId,
  projectId,
  people,
  assignedIds,
}: {
  workspaceId: string;
  projectId: string;
  people: Person[];
  assignedIds: string[];
}) {
  const [state, action, pending] = useActionState(
    mutateProject.bind(null, workspaceId, projectId, "members"),
    {},
  );
  return (
    <form action={action} className="project-form" aria-busy={pending}>
      <PeoplePicker
        people={people}
        assignedIds={assignedIds}
        disabled={pending}
      />
      {state.error && (
        <p className="auth-error" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="project-success" role="status">
          {state.success}
        </p>
      )}
      <div className="project-form-footer">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save people"}
        </Button>
      </div>
    </form>
  );
}
export function ArchiveProjectForm({
  workspaceId,
  projectId,
  archived,
}: {
  workspaceId: string;
  projectId: string;
  archived: boolean;
}) {
  const [state, action, pending] = useActionState(
    mutateProject.bind(
      null,
      workspaceId,
      projectId,
      archived ? "restore" : "archive",
    ),
    {},
  );
  return (
    <form action={action} className="project-archive-form" aria-busy={pending}>
      <div>
        <h2>
          {archived ? "Bring this project back" : "Done with this project?"}
        </h2>
        <p>
          {archived
            ? "Restore it to your active projects. All assigned people keep their access."
            : "Archive it to clear your active list. Its history and assigned people will be preserved."}
        </p>
      </div>
      <Button variant="outline" type="submit" disabled={pending}>
        {archived ? <RotateCcw size={15} /> : <Archive size={15} />}
        {pending ? "Saving…" : archived ? "Restore project" : "Archive project"}
      </Button>
      {state.error && (
        <p className="auth-error" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="project-success" role="status">
          {state.success}
        </p>
      )}
    </form>
  );
}
