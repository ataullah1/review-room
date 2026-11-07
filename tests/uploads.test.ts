import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { validateImage } from "../src/features/uploads/image";
import { uploadInput, maxImageBytes } from "../src/features/uploads/validation";
import { readUploadJson, uploadFailure } from "../src/features/uploads/http";
import { cleanupUploads } from "../src/features/uploads/cleanup";
import type { UploadStorage } from "../src/lib/storage/client";
const image = () =>
  sharp({
    create: { width: 40, height: 25, channels: 3, background: "#59734d" },
  });
describe("authoritative image validation", () => {
  it.each([
    ["png", "image/png", "png"],
    ["jpeg", "image/jpeg", "jpg"],
    ["webp", "image/webp", "webp"],
  ] as const)(
    "fully decodes supported %s bytes",
    async (format, mimeType, ext) => {
      const bytes = await image().toFormat(format).toBuffer();
      expect(
        await validateImage(bytes, {
          name: `design.${ext}`,
          mimeType,
          size: bytes.length,
        }),
      ).toMatchObject({
        width: 40,
        height: 25,
        fileSize: bytes.length,
        mimeType,
      });
    },
  );
  it("rejects fake extension or MIME even when declared metadata passes", async () => {
    const bytes = await image().jpeg().toBuffer();
    await expect(
      validateImage(bytes, {
        name: "fake.png",
        mimeType: "image/png",
        size: bytes.length,
      }),
    ).rejects.toThrow(/actual image format/);
  });
  it("rejects SVG, HTML, arbitrary binary and empty content", async () => {
    for (const bytes of [
      Buffer.from('<svg width="10" height="10"></svg>'),
      Buffer.from("<html>not an image</html>"),
      Buffer.from([1, 2, 3]),
      Buffer.alloc(0),
    ])
      await expect(
        validateImage(bytes, {
          name: "fake.png",
          mimeType: "image/png",
          size: Math.max(1, bytes.length),
        }),
      ).rejects.toThrow();
  });
  it("rejects corrupt images that retain a valid PNG header", async () => {
    const valid = await image().png().toBuffer();
    const bytes = valid.subarray(0, valid.length - 30);
    await expect(
      validateImage(bytes, {
        name: "corrupt.png",
        mimeType: "image/png",
        size: bytes.length,
      }),
    ).rejects.toThrow();
  });
  it("rejects oversize actual bytes and declared-size mismatch", async () => {
    const bytes = await image().png().toBuffer();
    await expect(
      validateImage(bytes, {
        name: "size.png",
        mimeType: "image/png",
        size: bytes.length + 1,
      }),
    ).rejects.toThrow(/size/);
    await expect(
      validateImage(Buffer.alloc(maxImageBytes + 1), {
        name: "large.png",
        mimeType: "image/png",
        size: maxImageBytes,
      }),
    ).rejects.toThrow(/size/);
  });
  it("rejects overlong sides and image decompression above 20 MP", async () => {
    for (const [width, height] of [
      [8193, 1],
      [5000, 4001],
    ]) {
      const bytes = await sharp({
        create: { width, height, channels: 3, background: "white" },
      })
        .png()
        .toBuffer();
      await expect(
        validateImage(bytes, {
          name: "large.png",
          mimeType: "image/png",
          size: bytes.length,
        }),
      ).rejects.toThrow(/8192|megapixel/);
    }
  });
  it("rejects APNG animation chunks before pixel decoding", async () => {
    const bytes = await image().png().toBuffer();
    const animation = Buffer.alloc(20);
    animation.writeUInt32BE(8);
    animation.write("acTL", 4);
    animation.writeUInt32BE(2, 8);
    const combined = Buffer.concat([
      bytes.subarray(0, 33),
      animation,
      bytes.subarray(33),
    ]);
    await expect(
      validateImage(combined, {
        name: "animated.png",
        mimeType: "image/png",
        size: combined.length,
      }),
    ).rejects.toThrow(/Animated/);
  });
  it("rejects animated WebP containers", async () => {
    const frame = await image().png().toBuffer();
    const bytes = await sharp(
      [
        frame,
        await sharp({
          create: { width: 40, height: 25, channels: 3, background: "red" },
        })
          .png()
          .toBuffer(),
      ],
      { join: { animated: true } },
    )
      .webp({ loop: 0, delay: [100, 100] })
      .toBuffer();
    await expect(
      validateImage(bytes, {
        name: "animated.webp",
        mimeType: "image/webp",
        size: bytes.length,
      }),
    ).rejects.toThrow(/Animated/);
  });
  it("validates filenames and payload metadata without trusting them as bytes", () => {
    for (const name of ["../x.png", "x\\y.png", "bad\0.png", "image.svg"])
      expect(
        uploadInput.safeParse({ name, mimeType: "image/png", size: 123 })
          .success,
      ).toBe(false);
    expect(
      uploadInput.safeParse({
        name: "file.jpg",
        mimeType: "image/png",
        size: 123,
      }).success,
    ).toBe(false);
  });
});
describe("upload HTTP boundary", () => {
  it("accepts only small JSON metadata and rejects malformed bodies", async () => {
    expect(
      await readUploadJson(
        new Request("https://example.test", {
          method: "POST",
          body: '{"name":"design.png"}',
        }),
      ),
    ).toEqual({ name: "design.png" });
    await expect(
      readUploadJson(
        new Request("https://example.test", {
          method: "POST",
          body: "invalid",
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      readUploadJson(
        new Request("https://example.test", {
          method: "POST",
          body: "a".repeat(4097),
        }),
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("does not expose unknown provider/database error strings and adds a safe reference", () => {
    const failure = uploadFailure(new Error("sensitive-provider-error"));
    expect(failure.status).toBe(503);
    expect(failure.error).toContain(
      "Could not complete this upload. Please try again.",
    );
    expect(failure.error).toContain("Reference:");
    expect(failure.error).not.toContain("sensitive-provider-error");
    expect(failure.requestId).toMatch(/^[a-f0-9-]{36}$/);
  });
});

describe("observable backlog-aware cleanup (RR-006)", () => {
  function makeMockStorage(): UploadStorage {
    return {
      put: vi.fn().mockResolvedValue(undefined),
      read: vi.fn().mockResolvedValue(Buffer.alloc(0)),
      remove: vi.fn().mockResolvedValue(undefined),
      signUpload: vi.fn().mockResolvedValue("https://example.test"),
      signRead: vi.fn().mockResolvedValue("https://example.test/download"),
    };
  }

  it("limits expired PENDING transitions to a bounded batch", async () => {
    const expiredRows = Array.from({ length: 5 }, (_, i) => ({
      id: `pending-${i}`,
    }));
    const findMany = vi
      .fn()
      .mockResolvedValueOnce(expiredRows)
      .mockResolvedValue([]);
    const updateMany = vi.fn().mockResolvedValue({ count: 5 });

    const tx = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
      assetVersion: {
        findMany,
        updateMany,
        update: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const db = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (client: typeof tx) => Promise<unknown>) =>
          fn(tx),
        ),
    } as unknown as Parameters<typeof cleanupUploads>[0];

    const storage = makeMockStorage();
    const result = await cleanupUploads(db, storage, 10);

    // Verify findMany bounded take is called
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PENDING" }),
        take: 20,
      }),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: expiredRows.map((r) => r.id) },
          status: "PENDING",
        }),
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
    expect(result.examined).toBe(0);
    expect(result.cleaned).toBe(0);
  });

  it("claims candidate rows with atomic worker lease token and expiry", async () => {
    const candidateRows = [{ id: "c-1" }, { id: "c-2" }];
    const leasedData = [
      {
        id: "c-1",
        status: "READY" as const,
        stagingKey: "stage/c-1.png",
        objectKey: "final/c-1.png",
      },
      {
        id: "c-2",
        status: "FAILED" as const,
        stagingKey: "stage/c-2.png",
        objectKey: "final/c-2.png",
      },
    ];

    const findMany = vi.fn().mockImplementation(({ where }) => {
      if (where.status === "PENDING") return Promise.resolve([]);
      if (where.cleanupAfter) return Promise.resolve(candidateRows);
      if (where.cleanupToken) return Promise.resolve(leasedData);
      return Promise.resolve([]);
    });
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const update = vi.fn().mockResolvedValue({});

    const tx = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
      assetVersion: {
        findMany,
        updateMany,
        update,
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const db = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (client: typeof tx) => Promise<unknown>) =>
          fn(tx),
        ),
    } as unknown as Parameters<typeof cleanupUploads>[0];

    const storage = makeMockStorage();
    const result = await cleanupUploads(db, storage, 25);

    expect(result.examined).toBe(2);
    expect(result.cleaned).toBe(2);
    expect(result.failed).toBe(0);

    // Verify worker lease was set
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["c-1", "c-2"] },
        }),
        data: expect.objectContaining({
          cleanupToken: expect.any(String),
          cleanupUntil: expect.any(Date),
        }),
      }),
    );

    // Verify READY removes only stagingKey
    expect(storage.remove).toHaveBeenCalledWith(["stage/c-1.png"]);
    // Verify FAILED removes both stagingKey and objectKey
    expect(storage.remove).toHaveBeenCalledWith([
      "stage/c-2.png",
      "final/c-2.png",
    ]);

    // Verify cleaned rows have lease cleared
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "c-1",
          cleanupToken: expect.any(String),
        }),
        data: expect.objectContaining({
          cleanedAt: expect.any(Date),
          cleanupToken: null,
          cleanupUntil: null,
        }),
      }),
    );
  });

  it("applies retry backoff and releases lease when storage removal fails", async () => {
    const candidateRows = [{ id: "fail-1" }];
    const leasedData = [
      {
        id: "fail-1",
        status: "FAILED" as const,
        stagingKey: "stage/fail-1.png",
        objectKey: "final/fail-1.png",
      },
    ];

    const findMany = vi.fn().mockImplementation(({ where }) => {
      if (where.status === "PENDING") return Promise.resolve([]);
      if (where.cleanupAfter) return Promise.resolve(candidateRows);
      if (where.cleanupToken) return Promise.resolve(leasedData);
      return Promise.resolve([]);
    });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const update = vi.fn().mockResolvedValue({});

    const tx = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
      assetVersion: {
        findMany,
        updateMany,
        update,
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const db = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (client: typeof tx) => Promise<unknown>) =>
          fn(tx),
        ),
    } as unknown as Parameters<typeof cleanupUploads>[0];

    const storage = makeMockStorage();
    vi.mocked(storage.remove).mockRejectedValueOnce(
      new Error("network failure"),
    );

    const fixedNow = new Date("2026-11-03T12:00:00Z");
    const result = await cleanupUploads(db, storage, {
      limit: 10,
      now: fixedNow,
      backoffMs: 300_000,
    });

    expect(result.examined).toBe(1);
    expect(result.cleaned).toBe(0);
    expect(result.failed).toBe(1);

    // Verify backoff advanced cleanupAfter by 300_000ms (5 mins) and cleared lease
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "fail-1",
          cleanupToken: expect.any(String),
        }),
        data: expect.objectContaining({
          cleanupRetryAt: new Date("2026-11-03T12:05:00Z"),
          cleanupToken: null,
          cleanupUntil: null,
        }),
      }),
    );
  });

  it("returns index-backed queue depth and oldest age in backlog metrics", async () => {
    const fixedNow = new Date("2026-11-03T12:00:00Z");
    const oldestDate = new Date("2026-11-03T11:00:00Z"); // 3600 seconds ago

    const count = vi.fn().mockImplementation(({ where }) => {
      if (where.status === "PENDING") return Promise.resolve(3);
      if (where.status === "READY") return Promise.resolve(10);
      if (where.status === "FAILED") return Promise.resolve(4);
      if (where.cleanupUntil) return Promise.resolve(2);
      return Promise.resolve(0);
    });
    const findFirst = vi.fn().mockResolvedValue({ cleanupAfter: oldestDate });

    const tx = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
      assetVersion: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        update: vi.fn().mockResolvedValue({}),
        count,
        findFirst,
      },
    };
    const db = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (client: typeof tx) => Promise<unknown>) =>
          fn(tx),
        ),
    } as unknown as Parameters<typeof cleanupUploads>[0];

    const storage = makeMockStorage();
    const result = await cleanupUploads(db, storage, {
      limit: 10,
      now: fixedNow,
    });

    expect(result.backlog).toEqual({
      pendingExpired: 3,
      readyStaging: 10,
      failedFinal: 4,
      totalQueue: 14,
      oldestAgeSeconds: 3600,
    });
    expect(result.leased).toBe(2);
  });

  it("respects dryRun flag without mutating or deleting rows", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const update = vi.fn().mockResolvedValue({});

    const tx = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
      assetVersion: {
        findMany,
        updateMany,
        update,
        count: vi.fn().mockResolvedValue(5),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const db = {
      $transaction: vi
        .fn()
        .mockImplementation((fn: (client: typeof tx) => Promise<unknown>) =>
          fn(tx),
        ),
    } as unknown as Parameters<typeof cleanupUploads>[0];

    const storage = makeMockStorage();
    const result = await cleanupUploads(db, storage, { dryRun: true });

    expect(result.examined).toBe(0);
    expect(result.cleaned).toBe(0);
    expect(storage.remove).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(result.backlog.totalQueue).toBe(10); // 5 ready + 5 failed
  });
});
