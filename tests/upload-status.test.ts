import { expect, it, vi } from "vitest";
import { getUploadStatus, claimUpload } from "../src/lib/data/uploads";
const id = "10000000-0000-4000-8000-000000000001",
  ws = "20000000-0000-4000-8000-000000000001",
  project = "30000000-0000-4000-8000-000000000001";
const now = new Date("2026-11-07T00:00:00Z");
function tx(status = "PENDING", lease = false) {
  return {
    $queryRaw: vi.fn(),
    membership: { findUnique: vi.fn().mockResolvedValue({ role: "DESIGNER" }) },
    project: {
      findFirst: vi.fn().mockResolvedValue({ id: project, archivedAt: null }),
    },
    assetVersion: {
      findFirst: vi.fn().mockResolvedValue({
        id,
        assetId: id,
        status,
        creatorId: id,
        workspaceId: ws,
        projectId: project,
        originalName: "test.png",
        createdAt: now,
        expiresAt: new Date(+now + 600000),
        processingToken: lease ? "old" : null,
        processingUntil: lease ? new Date(+now - 1) : null,
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}
it("exposes no object keys and distinguishes retry, processing, completion", async () => {
  const db = tx();
  const result = await getUploadStatus(db as never, id, ws, project, id, now);
  expect(result).toMatchObject({
    status: "PENDING",
    canRetry: true,
    nextAction: "finalize",
  });
  expect(result).not.toHaveProperty("objectKey");
  expect(
    await getUploadStatus(tx("READY") as never, id, ws, project, id, now),
  ).toMatchObject({ status: "READY", canCancel: false });
});
it("reclaims expired processing leases but never rewrites a READY version", async () => {
  const db = tx("PENDING", true);
  await claimUpload(db as never, id, ws, project, id, now);
  expect(db.assetVersion.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        OR: [{ processingToken: null }, { processingUntil: { lte: now } }],
      }),
    }),
  );
  const ready = tx("READY");
  expect(
    (await claimUpload(ready as never, id, ws, project, id, now)).token,
  ).toBeNull();
  expect(ready.assetVersion.updateMany).not.toHaveBeenCalled();
});
