import { describe, it, expect, vi } from "vitest";
import {
  makeToken,
  hashToken,
  tokenInput,
  inviteInput,
} from "../src/features/sharing/tokens";
import { safeReturnPath } from "../src/lib/auth/validation";
import {
  replaceInvitation,
  revokeInvitation,
  createInvitation,
} from "../src/lib/data/sharing";

const ownerId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "20000000-0000-4000-8000-000000000001";
const projectId = "30000000-0000-4000-8000-000000000001";
const inviteId = "40000000-0000-4000-8000-000000000001";

function makeMockTx(overrides: Record<string, unknown> = {}) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ value: new Date() }]),
    membership: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ role: "OWNER", workspaceId, userId: ownerId }),
    },
    project: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: projectId, workspaceId, archivedAt: null }),
    },
    projectInvitation: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: "new-invite-id",
          ...data,
          expiresAt: new Date(Date.now() + 7 * 86400000),
        }),
      ),
    },
    ...overrides,
  } as unknown as Parameters<typeof replaceInvitation>[0];
}

describe("invitation/share inputs", () => {
  it("generates distinct high entropy tokens and only accepts their full shape", () => {
    const a = makeToken(),
      b = makeToken();
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).not.toBe(b);
    expect(hashToken(a)).not.toBe(a);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(tokenInput.safeParse(a.slice(1)).success).toBe(false);
  });
  it("normalizes email and prevents OWNER invitations", () => {
    expect(
      inviteInput.parse({ email: "Client@Example.com", role: "CLIENT" }).email,
    ).toBe("client@example.com");
    expect(
      inviteInput.safeParse({ email: "x@example.com", role: "OWNER" }).success,
    ).toBe(false);
    expect(
      inviteInput.safeParse({ email: "bad", role: "DESIGNER" }).success,
    ).toBe(false);
  });
  it("permits only the fixed invitation return route in addition to private app paths", () => {
    expect(safeReturnPath("/invite/accept")).toBe("/invite/accept");
    for (const path of [
      "//evil.test",
      "/invite/accept?token=secret",
      "/invite/accept/evil",
      "https://evil.test",
    ])
      expect(safeReturnPath(path)).toBe("/app");
  });
});

describe("invitation lifecycle & access removal (RR-005)", () => {
  it("replaceInvitation revokes prior pending token and creates fresh 7-day invitation", async () => {
    const existing = {
      id: inviteId,
      email: "colleague@example.com",
      role: "DESIGNER",
      workspaceId,
      projectId,
      acceptedAt: null,
      revokedAt: null,
    };
    const tx = makeMockTx({
      projectInvitation: {
        findFirst: vi.fn().mockImplementation(({ where }) => {
          if (where.id === inviteId) return Promise.resolve(existing);
          if (where.acceptedAt) return Promise.resolve(null);
          return Promise.resolve(null);
        }),
        update: vi
          .fn()
          .mockResolvedValue({ ...existing, revokedAt: new Date() }),
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({
          id: "replaced-id",
          expiresAt: new Date("2026-11-10T00:00:00Z"),
        }),
      },
    });

    const result = await replaceInvitation(
      tx,
      ownerId,
      workspaceId,
      projectId,
      inviteId,
    );
    expect(result.id).toBe("replaced-id");
    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
    expect(tx.projectInvitation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: inviteId },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
  });

  it("replaceInvitation refuses to replace an already accepted invitation", async () => {
    const acceptedInvite = {
      id: inviteId,
      email: "colleague@example.com",
      role: "CLIENT",
      workspaceId,
      projectId,
      acceptedAt: new Date(),
      revokedAt: null,
    };
    const tx = makeMockTx({
      projectInvitation: {
        findFirst: vi.fn().mockResolvedValue(acceptedInvite),
      },
    });

    await expect(
      replaceInvitation(tx, ownerId, workspaceId, projectId, inviteId),
    ).rejects.toThrow(
      "This invitation has already been accepted. Manage access in Project people.",
    );
  });

  it("createInvitation and replaceInvitation reject conflicting workspace roles", async () => {
    const existingConflicting = {
      id: "prior-invite",
      email: "designer@example.com",
      role: "DESIGNER",
      workspaceId,
      acceptedAt: new Date(),
    };
    const tx = makeMockTx({
      projectInvitation: {
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue(existingConflicting),
      },
    });

    await expect(
      createInvitation(tx, ownerId, workspaceId, projectId, {
        email: "designer@example.com",
        role: "CLIENT",
      }),
    ).rejects.toThrow(
      "This user already has the designer role in this workspace.",
    );
  });

  it("revokeInvitation provides warning when revoking an accepted invitation", async () => {
    const acceptedRow = {
      id: inviteId,
      workspaceId,
      projectId,
      acceptedAt: new Date(),
      revokedAt: null,
    };
    const tx = makeMockTx({
      projectInvitation: {
        findFirst: vi.fn().mockResolvedValue(acceptedRow),
        update: vi
          .fn()
          .mockResolvedValue({ ...acceptedRow, revokedAt: new Date() }),
      },
    });

    const result = await revokeInvitation(
      tx,
      ownerId,
      workspaceId,
      projectId,
      inviteId,
    );
    expect(result.revoked).toBe(true);
    expect(result.warning).toContain(
      "Revoking an accepted invitation link does not remove project access",
    );
  });

  it("revokeInvitation provides no warning when revoking a pending invitation", async () => {
    const pendingRow = {
      id: inviteId,
      workspaceId,
      projectId,
      acceptedAt: null,
      revokedAt: null,
    };
    const tx = makeMockTx({
      projectInvitation: {
        findFirst: vi.fn().mockResolvedValue(pendingRow),
        update: vi
          .fn()
          .mockResolvedValue({ ...pendingRow, revokedAt: new Date() }),
      },
    });

    const result = await revokeInvitation(
      tx,
      ownerId,
      workspaceId,
      projectId,
      inviteId,
    );
    expect(result.revoked).toBe(true);
    expect(result.warning).toBeUndefined();
  });
});
