"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth/user";
import { requireSameOrigin } from "@/lib/auth/validation";
import { AccessError } from "@/lib/auth/errors";
import { withUserDatabase } from "@/lib/data/context";
import { actionFailure } from "@/lib/server/diagnostics";
import {
  createProject,
  updateProjectDetails,
  updateProjectMembers,
  removeProjectMember,
  setProjectArchived,
} from "@/lib/data/projects";
import { changeAssetRemoval } from "@/lib/data/asset-removal";
import { getDb } from "@/lib/server/db";
export type ProjectActionState = {
  error?: string;
  success?: string;
  projectId?: string;
};
export async function mutateProject(
  workspaceId: string,
  projectId: string | null,
  operation:
    | "create"
    | "members"
    | "remove-member"
    | "details"
    | "archive"
    | "restore"
    | "asset-remove"
    | "asset-restore",
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
      if (operation === "asset-remove" || operation === "asset-restore") {
        if (operation === "asset-remove" && form.get("confirm") !== "yes")
          throw new AccessError("Confirm the removal impact first.", 400);
        await changeAssetRemoval(tx, user.id, workspaceId, projectId, {
          assetId: form.get("assetId"),
          restoring: operation === "asset-restore",
          reason: String(form.get("reason") || ""),
        });
        return { id: projectId };
      }
      if (operation === "details") {
        await updateProjectDetails(tx, user.id, workspaceId, projectId, {
          name: form.get("name"),
          description: form.get("description") || "",
          dueDate: form.get("dueDate") || "",
        });
        return { id: projectId };
      }
      if (operation === "members")
        await updateProjectMembers(tx, user.id, workspaceId, projectId, {
          memberIds: form.getAll("memberIds"),
        });
      else if (operation === "remove-member") {
        const targetUserId = String(form.get("userId") || "");
        await removeProjectMember(
          tx,
          user.id,
          workspaceId,
          projectId,
          targetUserId,
        );
      } else if (operation === "archive" || operation === "restore")
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
    revalidatePath(`/app/${workspaceId}/projects/${result.id}`, "layout");
    return {
      success:
        operation === "asset-remove"
          ? "Design removed. Original bytes and history are retained; restore within 30 days."
          : operation === "asset-restore"
            ? "Design restored. Previously revoked share links stay revoked."
            : operation === "members"
              ? "Project people updated."
              : operation === "remove-member"
                ? "Member removed from this project. Workspace membership and other project assignments remain."
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

export async function removeDesignAction(
  workspaceId: string,
  projectId: string,
  previous: ProjectActionState,
  form: FormData,
): Promise<ProjectActionState> {
  const result = await mutateProject(
    workspaceId,
    projectId,
    "asset-remove",
    previous,
    form,
  );
  // Redirect outside mutateProject's failure handler so NEXT_REDIRECT is never swallowed.
  if (result.success) redirect(`/app/${workspaceId}/projects/${projectId}`);
  return result;
}
