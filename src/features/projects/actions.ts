"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth/user";
import { requireSameOrigin } from "@/lib/auth/validation";
import { AccessError } from "@/lib/auth/errors";
import { withUserDatabase } from "@/lib/data/context";
import { actionFailure } from "@/lib/server/diagnostics";
import {
  createProject,
  updateProjectMembers,
  setProjectArchived,
} from "@/lib/data/projects";
import { getDb } from "@/lib/server/db";
export type ProjectActionState = {
  error?: string;
  success?: string;
  projectId?: string;
};
export async function mutateProject(
  workspaceId: string,
  projectId: string | null,
  operation: "create" | "members" | "archive" | "restore",
  _previous: ProjectActionState,
  form: FormData,
): Promise<ProjectActionState> {
  try {
    if (!requireSameOrigin(await headers()))
      throw new AccessError("Request origin is not allowed.");
    const user = await requireUser();
    const result = await withUserDatabase(getDb(), user.id, async (tx) => {
      if (operation === "create")
        return createProject(tx, user.id, workspaceId, {
          id: form.get("requestId"),
          name: form.get("name"),
          memberIds: form.getAll("memberIds"),
        });
      if (!projectId) throw new AccessError();
      if (operation === "members")
        await updateProjectMembers(tx, user.id, workspaceId, projectId, {
          memberIds: form.getAll("memberIds"),
        });
      else if (operation === "archive" || operation === "restore")
        await setProjectArchived(
          tx,
          user.id,
          workspaceId,
          projectId,
          operation === "archive",
        );
      else throw new AccessError();
      return { id: projectId };
    });
    revalidatePath(`/app/${workspaceId}/projects`);
    revalidatePath(`/app/${workspaceId}/projects/${result.id}`);
    return {
      success:
        operation === "members"
          ? "Project people updated."
          : operation === "archive"
            ? "Project archived. Its history and people are preserved."
            : operation === "restore"
              ? "Project restored."
              : "Project created.",
      projectId: result.id,
    };
  } catch (error) {
    return actionFailure(error, {
      domain: "projects",
      operation,
      stage: "mutate_project",
      fallback: "Could not save your changes. Please refresh and try again.",
    });
  }
}
