import { z } from "zod";
export const projectMembersSchema = z.object({
  memberIds: z
    .array(z.uuid())
    .max(100)
    .default([])
    .transform((ids) => [...new Set(ids)]),
});
export const createProjectSchema = projectMembersSchema.extend({
  id: z.uuid(),
  name: z
    .string()
    .trim()
    .min(2, "Use at least 2 characters.")
    .max(150, "Use no more than 150 characters.")
    .refine(
      (name) =>
        !Array.from(name).some(
          (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
        ),
      "Use a project name without control characters.",
    ),
});
const pageSchema = z.coerce.number().int().min(1).max(100000);
export function projectFilters(
  input: {
    q?: string | string[];
    status?: string | string[];
    page?: string | string[];
  } = {},
) {
  return {
    q: (typeof input.q === "string" ? input.q : "").trim().slice(0, 150),
    status:
      input.status === "archived" ? ("archived" as const) : ("active" as const),
    page:
      typeof input.page === "string" && pageSchema.safeParse(input.page).success
        ? pageSchema.parse(input.page)
        : 1,
  };
}
export type ProjectFilters = ReturnType<typeof projectFilters>;
export const projectPageSize = 12;
