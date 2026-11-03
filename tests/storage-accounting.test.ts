import { describe, expect, it, vi } from "vitest";
import {
  readStorageLimits,
  DEFAULT_MAX_STORAGE_BYTES,
  DEFAULT_MAX_READY_VERSIONS,
  DEFAULT_MAX_PENDING_UPLOADS,
} from "../src/lib/config/limits";
import {
  getWorkspaceStorageUsage,
  assertStorageAvailable,
  reconcileWorkspaceStorage,
} from "../src/lib/data/storage-accounting";

const userId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "20000000-0000-4000-8000-000000000001";

describe("storage limits configuration", () => {
  it("provides documented finite defaults", () => {
    const limits = readStorageLimits({});
    expect(limits.maxStorageBytes).toBe(DEFAULT_MAX_STORAGE_BYTES);
    expect(limits.maxReadyVersions).toBe(DEFAULT_MAX_READY_VERSIONS);
    expect(limits.maxPendingUploads).toBe(DEFAULT_MAX_PENDING_UPLOADS);
    expect(limits.maxStorageBytes).toBe(500 * 1024 * 1024);
  });

  it("parses valid positive integer overrides", () => {
    const limits = readStorageLimits({
      WORKSPACE_MAX_STORAGE_BYTES: "104857600",
      WORKSPACE_MAX_READY_VERSIONS: "50",
      WORKSPACE_MAX_PENDING_UPLOADS: "3",
    });
    expect(limits.maxStorageBytes).toBe(100 * 1024 * 1024);
    expect(limits.maxReadyVersions).toBe(50);
    expect(limits.maxPendingUploads).toBe(3);
  });

  it("safely falls back to defaults for invalid or negative inputs", () => {
    const limits = readStorageLimits({
      WORKSPACE_MAX_STORAGE_BYTES: "-100",
      WORKSPACE_MAX_READY_VERSIONS: "NaN",
      WORKSPACE_MAX_PENDING_UPLOADS: "0",
    });
    expect(limits.maxStorageBytes).toBe(DEFAULT_MAX_STORAGE_BYTES);
    expect(limits.maxReadyVersions).toBe(DEFAULT_MAX_READY_VERSIONS);
    expect(limits.maxPendingUploads).toBe(DEFAULT_MAX_PENDING_UPLOADS);
  });
});

describe("workspace storage usage accounting (RR-007)", () => {
  function makeMockTx(overrides: Record<string, unknown> = {}) {
    return {
      $queryRaw: vi.fn().mockResolvedValue([]),
      membership: {
        findUnique: vi.fn().mockResolvedValue({
          workspaceId,
          userId,
          role: "OWNER",
        }),
      },
      assetVersion: {
        aggregate: vi.fn().mockImplementation(({ where }) => {
          if (where.status === "READY") {
            return Promise.resolve({
              _sum: { fileSize: 50 * 1024 * 1024 }, // 50 MB
              _count: { id: 10 },
            });
          }
          if (where.status === "PENDING") {
            return Promise.resolve({
              _sum: { expectedSize: 10 * 1024 * 1024 }, // 10 MB
              _count: { id: 2 },
            });
          }
          return Promise.resolve({ _sum: {}, _count: { id: 0 } });
        }),
      },
      ...overrides,
    } as unknown as Parameters<typeof getWorkspaceStorageUsage>[0];
  }

  it("accurately sums committed READY bytes and active unexpired PENDING bytes", async () => {
    const tx = makeMockTx();
    const usage = await getWorkspaceStorageUsage(tx, userId, workspaceId, {
      maxStorageBytes: 100 * 1024 * 1024,
      maxReadyVersions: 50,
      maxPendingUploads: 5,
    });

    expect(usage.committedBytes).toBe(50 * 1024 * 1024);
    expect(usage.reservedBytes).toBe(10 * 1024 * 1024);
    expect(usage.totalAccountedBytes).toBe(60 * 1024 * 1024);
    expect(usage.readyVersionsCount).toBe(10);
    expect(usage.pendingUploadsCount).toBe(2);
    expect(usage.usagePercentage).toBe(60);
    expect(usage.isOverLimit).toBe(false);
  });

  it("assertStorageAvailable serializes under workspace advisory lock and accepts valid uploads", async () => {
    const tx = makeMockTx();
    const result = await assertStorageAvailable(
      tx,
      userId,
      workspaceId,
      5 * 1024 * 1024, // 5 MB upload
      {
        maxStorageBytes: 100 * 1024 * 1024,
        maxReadyVersions: 50,
        maxPendingUploads: 5,
      },
    );

    expect(result.totalAccountedBytes).toBe(60 * 1024 * 1024);
    expect(tx.$queryRaw).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.stringContaining("SELECT pg_advisory_xact_lock"),
      ]),
      expect.anything(),
    );
  });

  it("assertStorageAvailable rejects new reservation when byte limit would be exceeded", async () => {
    const tx = makeMockTx();

    await expect(
      assertStorageAvailable(
        tx,
        userId,
        workspaceId,
        45 * 1024 * 1024, // 60MB current + 45MB = 105MB > 100MB
        {
          maxStorageBytes: 100 * 1024 * 1024,
          maxReadyVersions: 50,
          maxPendingUploads: 5,
        },
      ),
    ).rejects.toMatchObject({
      status: 429,
      message: expect.stringContaining("Workspace storage limit reached"),
    });
  });

  it("assertStorageAvailable rejects when ready version count limit would be exceeded", async () => {
    const tx = makeMockTx({
      assetVersion: {
        aggregate: vi.fn().mockImplementation(({ where }) => {
          if (where.status === "READY") {
            return Promise.resolve({
              _sum: { fileSize: 10 * 1024 * 1024 },
              _count: { id: 50 }, // at limit
            });
          }
          return Promise.resolve({ _sum: {}, _count: { id: 0 } });
        }),
      },
    });

    await expect(
      assertStorageAvailable(tx, userId, workspaceId, 1024, {
        maxStorageBytes: 100 * 1024 * 1024,
        maxReadyVersions: 50,
        maxPendingUploads: 5,
      }),
    ).rejects.toMatchObject({
      status: 429,
      message: expect.stringContaining("Workspace version limit reached"),
    });
  });

  it("assertStorageAvailable rejects when workspace pending uploads limit is reached", async () => {
    const tx = makeMockTx({
      assetVersion: {
        aggregate: vi.fn().mockImplementation(({ where }) => {
          if (where.status === "READY") {
            return Promise.resolve({
              _sum: { fileSize: 10 * 1024 * 1024 },
              _count: { id: 5 },
            });
          }
          if (where.status === "PENDING") {
            return Promise.resolve({
              _sum: { expectedSize: 5 * 1024 * 1024 },
              _count: { id: 5 }, // 5 active pending reservations
            });
          }
          return Promise.resolve({ _sum: {}, _count: { id: 0 } });
        }),
      },
    });

    await expect(
      assertStorageAvailable(tx, userId, workspaceId, 1024, {
        maxStorageBytes: 100 * 1024 * 1024,
        maxReadyVersions: 50,
        maxPendingUploads: 5,
      }),
    ).rejects.toMatchObject({
      status: 429,
      message: expect.stringContaining(
        "Finish or cancel existing pending uploads",
      ),
    });
  });

  it("getWorkspaceStorageUsage rejects unauthorized non-members", async () => {
    const tx = makeMockTx({
      membership: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    });

    await expect(
      getWorkspaceStorageUsage(tx, "stranger-id", workspaceId),
    ).rejects.toThrow();
  });
});

describe("operator storage reconciliation (RR-007)", () => {
  it("reconciles workspace storage without deleting files", async () => {
    const db = {
      workspace: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: workspaceId, name: "Production Studio" }]),
      },
      assetVersion: {
        aggregate: vi.fn().mockImplementation(({ where }) => {
          if (where.status === "READY") {
            return Promise.resolve({
              _sum: { fileSize: 200 * 1024 * 1024 },
              _count: { id: 25 },
            });
          }
          if (where.status === "PENDING" && where.expiresAt.gt) {
            return Promise.resolve({
              _sum: { expectedSize: 20 * 1024 * 1024 },
              _count: { id: 2 },
            });
          }
          if (where.status === "PENDING" && where.expiresAt.lte) {
            return Promise.resolve({
              _sum: { expectedSize: 10 * 1024 * 1024 },
              _count: { id: 1 },
            });
          }
          return Promise.resolve({ _sum: {}, _count: { id: 0 } });
        }),
        count: vi.fn().mockResolvedValue(3), // 3 FAILED versions
      },
    } as unknown as Parameters<typeof reconcileWorkspaceStorage>[0];

    const reports = await reconcileWorkspaceStorage(db, workspaceId, {
      maxStorageBytes: 500 * 1024 * 1024,
      maxReadyVersions: 200,
      maxPendingUploads: 5,
    });

    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      workspaceId,
      workspaceName: "Production Studio",
      committedBytes: 200 * 1024 * 1024,
      reservedBytes: 20 * 1024 * 1024,
      stalePendingBytes: 10 * 1024 * 1024,
      totalAccountedBytes: 220 * 1024 * 1024,
      readyVersionsCount: 25,
      activePendingCount: 2,
      expiredPendingCount: 1,
      failedVersionsCount: 3,
      isOverLimit: false,
    });
  });
});
