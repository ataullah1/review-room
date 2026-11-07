import { it, expect } from "vitest";
import { projectDetailsSchema } from "../src/features/projects/validation";
it("keeps nullable metadata and date-only values stable", () => {
  expect(
    projectDetailsSchema.parse({
      name: "New project",
      description: "  brief  ",
      dueDate: "2026-11-07",
    }),
  ).toEqual({
    name: "New project",
    description: "brief",
    dueDate: new Date("2026-11-07T00:00:00Z"),
  });
  expect(
    projectDetailsSchema.parse({
      name: "Project",
      description: "",
      dueDate: "",
    }).dueDate,
  ).toBeNull();
  expect(
    projectDetailsSchema.safeParse({
      name: "Project",
      description: "",
      dueDate: "2026-02-31",
    }).success,
  ).toBe(false);
});
