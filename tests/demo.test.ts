import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  signDemoCookie,
  readDemoCookie,
  newDemoIdentity,
} from "../src/features/demo/cookie";
import {
  seededDemo,
  demoMutation,
  demoState,
} from "../src/features/demo/state";
import { demoAssets } from "../src/features/demo/catalog";
const env = {
    SIGNUP_RATE_LIMIT_SECRET: "unit-only-guest-signing-secret-1234567890",
  },
  now = 1800000000000;
describe("isolated demo contracts", () => {
  it("matches artwork dimensions and the agreed historical feedback counts", async () => {
    const seed = seededDemo();
    for (const [index, asset] of demoAssets.entries()) {
      expect(
        seed.comments.filter(
          (comment) =>
            comment.assetId === asset.id &&
            comment.version === 1 &&
            !comment.parentId,
        ),
      ).toHaveLength([3, 2, 3][index]);
      for (const version of asset.versions) {
        const metadata = await sharp(`public${version.src}`).metadata();
        expect([metadata.width, metadata.height]).toEqual([
          version.width,
          version.height,
        ]);
        expect(metadata.format).toBe("webp");
      }
    }
  });
  it("verifies a signed guest cookie and rejects tampering or expiration", () => {
    const a = newDemoIdentity(),
      cookie = signDemoCookie(a.id, a.token, now + 86400000, env);
    expect(readDemoCookie(cookie, env, now)?.id).toBe(a.id);
    expect(
      readDemoCookie(cookie.replace(a.id, randomUUID()), env, now),
    ).toBeNull();
    expect(readDemoCookie(cookie, env, now + 86400001)).toBeNull();
    expect(
      readDemoCookie(
        cookie,
        { SIGNUP_RATE_LIMIT_SECRET: "another-unit-signing-secret-1234567890" },
        now,
      ),
    ).toBeNull();
    expect(readDemoCookie("bad.cookie", env, now)).toBeNull();
  });
  it("creates detached seeds for three original designs with two versions and pending review", () => {
    const a = seededDemo(),
      b = seededDemo();
    a.comments[0].body = "only A";
    expect(b.comments[0].body).not.toBe("only A");
    expect(demoAssets).toHaveLength(3);
    expect(
      demoAssets.every(
        (a) =>
          a.versions.length === 2 &&
          a.versions.every((v) => v.src.startsWith("/demo/")),
      ),
    ).toBe(true);
    expect(
      b.decisions.some((d) => d.assetId === "identity" && d.version === 2),
    ).toBe(false);
    expect(demoState.safeParse(b).success).toBe(true);
  });
  it("rejects real workspace IDs, unknown role fields, uploads and invitations", () => {
    const base = {
      requestId: randomUUID(),
      generation: 0,
      operation: "view",
      view: "CLIENT",
    };
    expect(demoMutation.safeParse(base).success).toBe(true);
    for (const extra of [
      { workspaceId: randomUUID() },
      { userId: randomUUID() },
      { role: "OWNER" },
    ])
      expect(demoMutation.safeParse({ ...base, ...extra }).success).toBe(false);
    for (const operation of ["upload", "invite", "publish"])
      expect(demoMutation.safeParse({ ...base, operation }).success).toBe(
        false,
      );
    expect(
      demoMutation.safeParse({
        ...base,
        operation: "comment",
        assetId: randomUUID(),
        version: 2,
        body: "no",
        xRatio: 0.5,
        yRatio: 0.5,
      }).success,
    ).toBe(false);
  });
  it("requires confirmed resets and bounded plain text/pin inputs", () => {
    const base = { requestId: randomUUID(), generation: 0 };
    expect(
      demoMutation.safeParse({ ...base, operation: "reset" }).success,
    ).toBe(false);
    expect(
      demoMutation.safeParse({ ...base, operation: "reset", confirm: true })
        .success,
    ).toBe(true);
    const comment = {
      ...base,
      operation: "comment",
      assetId: "identity",
      version: 2,
      body: " <b>plain text</b> ",
      xRatio: 0.1,
      yRatio: 0.9,
    };
    expect(demoMutation.parse(comment)).toMatchObject({
      body: "<b>plain text</b>",
    });
    expect(demoMutation.safeParse({ ...comment, xRatio: 1.1 }).success).toBe(
      false,
    );
    expect(
      demoMutation.safeParse({ ...comment, body: "a".repeat(1001) }).success,
    ).toBe(false);
  });
});
