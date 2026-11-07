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
      input.status === "archived"
        ? ("archived" as const)
        : input.status === "completed"
          ? ("completed" as const)
          : ("active" as const),
    page:
      typeof input.page === "string" && pageSchema.safeParse(input.page).success
        ? pageSchema.parse(input.page)
        : 1,
  };
}
export type ProjectFilters = ReturnType<typeof projectFilters>;
export const projectPageSize = 12;

export const projectDetailsSchema = z.object({
  name: createProjectSchema.shape.name,
  description: z
    .string()
    .trim()
    .max(2000)
    .refine((value) => !value.includes("\u0000"))
    .transform((value) => value || null),
  dueDate: z
    .string()
    .refine(
      (value) =>
        !value ||
        (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
          !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
          new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value),
      "Choose a valid date.",
    )
    .transform((value) => (value ? new Date(`${value}T00:00:00Z`) : null)),
});
