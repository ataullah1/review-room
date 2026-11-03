import { describe, expect, it, vi } from "vitest";
import {
  createProjectSchema,
  projectFilters,
  projectMembersSchema,
} from "../src/features/projects/validation";
import { removeProjectMember } from "../src/lib/data/projects";

const id = "30000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "20000000-0000-4000-8000-000000000001";
const projectId = "30000000-0000-4000-8000-000000000001";
const targetUserId = "40000000-0000-4000-8000-000000000001";

function makeMockTx(overrides: Record<string, unknown> = {}) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    membership: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ role: "OWNER", workspaceId, userId: ownerId }),
    },
    project: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: projectId, workspaceId, archivedAt: null }),
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ id: projectId, workspaceId, archivedAt: null }),
    },
    projectMember: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ projectId, workspaceId, userId: targetUserId }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    ...overrides,
  } as unknown as Parameters<typeof removeProjectMember>[0];
}

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

describe("explicit project member access removal (RR-005)", () => {
  it("removes project member record and preserves workspace membership", async () => {
    const tx = makeMockTx();
    const result = await removeProjectMember(
      tx,
      ownerId,
      workspaceId,
      projectId,
      targetUserId,
    );

    expect(result).toEqual({ removed: true, userId: targetUserId });
    expect(tx.projectMember.deleteMany).toHaveBeenCalledWith({
      where: { projectId, workspaceId, userId: targetUserId },
    });
  });

  it("fails with 404 if user is not a member of the project", async () => {
    const tx = makeMockTx({
      projectMember: {
        findFirst: vi.fn().mockResolvedValue(null),
        deleteMany: vi.fn(),
      },
    });

    await expect(
      removeProjectMember(tx, ownerId, workspaceId, projectId, targetUserId),
    ).rejects.toThrow("Member not found in this project.");
  });

  it("fails with 409 if project is archived", async () => {
    const tx = makeMockTx({
      project: {
        findFirst: vi.fn().mockResolvedValue({
          id: projectId,
          workspaceId,
          archivedAt: new Date(),
        }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: projectId,
          workspaceId,
          archivedAt: new Date(),
        }),
      },
    });

    await expect(
      removeProjectMember(tx, ownerId, workspaceId, projectId, targetUserId),
    ).rejects.toThrow("Restore this project before changing its people.");
  });

  it("rejects non-UUID targetUserId", async () => {
    const tx = makeMockTx();
    await expect(
      removeProjectMember(tx, ownerId, workspaceId, projectId, "invalid-uuid"),
    ).rejects.toThrow();
  });

  it("rejects non-OWNER callers", async () => {
    const tx = makeMockTx({
      membership: {
        findUnique: vi.fn().mockResolvedValue({
          role: "CLIENT",
          workspaceId,
          userId: "client-id",
        }),
      },
      project: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: projectId, workspaceId, archivedAt: null }),
      },
    });

    await expect(
      removeProjectMember(
        tx,
        "client-id",
        workspaceId,
        projectId,
        targetUserId,
      ),
    ).rejects.toThrow();
  });
});
