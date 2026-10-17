import { describe, expect, it } from "vitest";
import {
  createProjectSchema,
  projectFilters,
  projectMembersSchema,
} from "../src/features/projects/validation";
const id = "30000000-0000-4000-8000-000000000001";
describe("project input boundaries", () => {
  it("trims names, deduplicates members and drops supplied tenant/role/archive data", () => {
    expect(
      createProjectSchema.parse({
        id,
        name: "  New campaign  ",
        memberIds: [id, id],
        workspaceId: "forged",
        role: "OWNER",
        archivedAt: "now",
      }),
    ).toEqual({ id, name: "New campaign", memberIds: [id] });
  });
  it.each(["", " ", "a", "a".repeat(151), "bad\u0000name"])(
    "rejects invalid project names",
    (name) => {
      expect(createProjectSchema.safeParse({ id, name }).success).toBe(false);
    },
  );
  it("requires an idempotency ID and bounds member selections", () => {
    expect(createProjectSchema.safeParse({ name: "Name" }).success).toBe(false);
    expect(
      projectMembersSchema.safeParse({ memberIds: ["forged"] }).success,
    ).toBe(false);
    expect(
      projectMembersSchema.safeParse({ memberIds: Array(101).fill(id) })
        .success,
    ).toBe(false);
  });
  it("normalizes filters and rejects invalid page values", () => {
    expect(
      projectFilters({ q: " campaign ", status: "archived", page: "2" }),
    ).toEqual({ q: "campaign", status: "archived", page: 2 });
    for (const page of ["0", "-1", "2.5", "NaN", "Infinity", "100001"])
      expect(projectFilters({ page, status: "forged" })).toMatchObject({
        page: 1,
        status: "active",
      });
    expect(
      projectFilters({ q: ["one", "two"], page: ["2"], status: ["archived"] }),
    ).toEqual({ q: "", page: 1, status: "active" });
    expect(projectFilters({ q: "a".repeat(200) }).q).toHaveLength(150);
  });
});
