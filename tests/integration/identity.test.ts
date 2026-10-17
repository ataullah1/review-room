import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { assertLocalDatabase } from "../../prisma/local-safety";
import {
  fixtureIds as ids,
  seedDevelopmentDatabase,
} from "../../prisma/seed-data";
import { bootstrapWithQuota } from "../../src/lib/data/onboarding";
import { signupNetworkHash } from "../../src/lib/auth/ip";
import { bootstrapWorkspace } from "../../src/lib/data/bootstrap";
import { withUserDatabase } from "../../src/lib/data/context";
import {
  listProjects,
  requireProjectAccess,
  requireProjectRole,
  renameWorkspace,
} from "../../src/lib/data/permissions";
import {
  reserveSignup,
  sha256,
  consumeSignupPermit,
} from "../../src/lib/auth/rate-limit";

const connectionString = assertLocalDatabase(
  process.env.TEST_DATABASE_URL,
  "test",
);
const makeDb = () =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString }, { schema: "app" }),
  });
const db = makeDb();
const secondProcess = makeDb();
const newUser = randomUUID();
const oauthUsers = [randomUUID(), randomUUID()];
const extraProject = randomUUID();
const rateKeys: string[] = [];
const tokens: string[] = [];
beforeAll(async () => {
  await seedDevelopmentDatabase(db);
  await db.project.create({
    data: {
      id: extraProject,
      workspaceId: ids.workspace,
      name: "Unassigned project",
    },
  });
});
afterAll(async () => {
  await db.project.deleteMany({ where: { id: extraProject } });
  await db.workspace.deleteMany({
    where: { createdById: { in: [newUser, ...oauthUsers] } },
  });
  await db.userProfile.deleteMany({
    where: { id: { in: [newUser, ...oauthUsers] } },
  });
  await db.signupRateBucket.deleteMany({
    where: {
      keyHash: {
        in: rateKeys.flatMap((key) => [
          sha256(`hour:${key}`),
          sha256(`day:${key}`),
        ]),
      },
    },
  });
  await db.signupPermit.deleteMany({
    where: { tokenHash: { in: tokens.map(sha256) } },
  });
  await db.$disconnect();
  await secondProcess.$disconnect();
});
describe("idempotent bootstrap", () => {
  it("creates exactly one workspace/profile/OWNER edge across simultaneous clients", async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        bootstrapWorkspace(i % 2 ? db : secondProcess, {
          id: newUser,
          displayName: "Concurrent owner",
        }),
      ),
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(await db.workspace.count({ where: { createdById: newUser } })).toBe(
      1,
    );
    expect(await db.userProfile.count({ where: { id: newUser } })).toBe(1);
    expect(
      await db.membership.findMany({ where: { userId: newUser } }),
    ).toMatchObject([{ role: "OWNER" }]);
  });
});
describe("server authorization plus enforced RLS", () => {
  it("uses a non-owner role without RLS bypass", async () => {
    const role = await withUserDatabase(
      db,
      ids.owner,
      (tx) =>
        tx.$queryRaw<
          Array<{ current_user: string; rolbypassrls: boolean }>
        >`SELECT current_user, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
    );
    expect(role[0]).toMatchObject({
      current_user: "review_room_user",
      rolbypassrls: false,
    });
  });
  it("owner sees all workspace projects; designer/client only assigned projects", async () => {
    expect(
      (
        await withUserDatabase(db, ids.owner, (tx) =>
          listProjects(tx, ids.owner, ids.workspace),
        )
      ).map((p) => p.id),
    ).toEqual(expect.arrayContaining([ids.project, extraProject]));
    for (const userId of [ids.designer, ids.client])
      expect(
        (
          await withUserDatabase(db, userId, (tx) =>
            listProjects(tx, userId, ids.workspace),
          )
        ).map((p) => p.id),
      ).toEqual([ids.project]);
    expect(
      await withUserDatabase(db, ids.unassigned, (tx) =>
        listProjects(tx, ids.unassigned, ids.workspace),
      ),
    ).toEqual([]);
  });
  it("denies outsider and forged nested IDs at the helper boundary", async () => {
    for (const [userId, workspace, project] of [
      [ids.outsider, ids.workspace, ids.project],
      [ids.owner, ids.workspace, ids.otherProject],
      [ids.client, ids.workspace, extraProject],
      [ids.unassigned, ids.workspace, ids.project],
    ])
      await expect(
        withUserDatabase(db, userId, (tx) =>
          requireProjectAccess(tx, userId, workspace, project),
        ),
      ).rejects.toMatchObject({ status: 403 });
  });
  it("RLS hides other projects even when a query omits every application filter", async () => {
    const rows = await withUserDatabase(db, ids.designer, (tx) =>
      tx.project.findMany(),
    );
    expect(rows.map((p) => p.id)).toEqual([ids.project]);
    expect(
      await withUserDatabase(db, ids.unassigned, (tx) => tx.project.findMany()),
    ).toEqual([]);
    const foreign = await withUserDatabase(db, ids.owner, (tx) =>
      tx.workspace.findMany({ where: { id: ids.otherWorkspace } }),
    );
    expect(foreign).toEqual([]);
  });
  it("blocks designer workspace writes through helper and bare database write", async () => {
    await expect(
      withUserDatabase(db, ids.designer, (tx) =>
        renameWorkspace(tx, ids.designer, ids.workspace, "Forged title"),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      await withUserDatabase(db, ids.designer, (tx) =>
        tx.workspace.updateMany({
          where: { id: ids.workspace },
          data: { name: "Forged title" },
        }),
      ),
    ).toEqual({ count: 0 });
    await expect(
      withUserDatabase(db, ids.client, (tx) =>
        tx.membership.update({
          where: {
            workspaceId_userId: {
              workspaceId: ids.workspace,
              userId: ids.client,
            },
          },
          data: { role: "OWNER" },
        }),
      ),
    ).rejects.toThrow();
  });
  it("allows owner settings writes and blocks assigning own OWNER role to another workspace", async () => {
    const own = await withUserDatabase(db, ids.owner, (tx) =>
      renameWorkspace(tx, ids.owner, ids.workspace, "Sample studio"),
    );
    expect(own.name).toBe("Sample studio");
    await expect(
      withUserDatabase(db, newUser, (tx) =>
        tx.membership.create({
          data: {
            workspaceId: ids.otherWorkspace,
            userId: newUser,
            role: "OWNER",
          },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      withUserDatabase(db, ids.designer, (tx) =>
        requireProjectRole(tx, ids.designer, ids.workspace, ids.project, [
          "OWNER",
        ]),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("has no identity leakage between pooled transactions; missing identity is denied", async () => {
    await withUserDatabase(db, ids.owner, (tx) => tx.workspace.findMany());
    await expect(
      withUserDatabase(db, "", (tx) => tx.workspace.findMany()),
    ).rejects.toMatchObject({ status: 401 });
    expect(
      await withUserDatabase(secondProcess, ids.outsider, (tx) =>
        tx.project.findMany(),
      ),
    ).toMatchObject([{ id: ids.otherProject }]);
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE review_room_user");
      await tx.$queryRaw`SELECT set_config('request.jwt.claim.sub', '', true)`;
      expect(await tx.project.findMany()).toEqual([]);
    });
  });
});
describe("durable signup limiter and one-use permit", () => {
  it("accepts at most five concurrent requests across separate database clients", async () => {
    const key = sha256(randomUUID());
    rateKeys.push(key);
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        reserveSignup(i % 2 ? db : secondProcess, key, "test@example.test"),
      ),
    );
    for (const r of results) if (r.status === "fulfilled") tokens.push(r.value);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect(
      results
        .filter((r) => r.status === "rejected")
        .every((r) => r.status === "rejected" && r.reason.status === 429),
    ).toBe(true);
    expect(
      (
        await secondProcess.signupRateBucket.findUniqueOrThrow({
          where: { keyHash: sha256(`hour:${key}`) },
        })
      ).attempts,
    ).toBe(5);
  });
  it("survives a client restart, enforces daily quota and clears expired counters", async () => {
    const key = sha256(randomUUID());
    rateKeys.push(key);
    const dayKey = sha256(`day:${key}`);
    await db.$executeRaw`INSERT INTO app."SignupRateBucket" ("keyHash", attempts, "expiresAt") VALUES (${dayKey}, 20, NOW() + INTERVAL '1 minute')`;
    await expect(
      reserveSignup(secondProcess, key, "test@example.test"),
    ).rejects.toMatchObject({ status: 429 });
    await db.$executeRaw`UPDATE app."SignupRateBucket" SET "expiresAt" = NOW() - INTERVAL '1 minute' WHERE "keyHash" = ${dayKey}`;
    const restarted = makeDb();
    try {
      const token = await reserveSignup(restarted, key, "test@example.test");
      tokens.push(token);
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await restarted.$disconnect();
    }
  });
  it("blocks direct-provider signup without permit, binds email, and rejects replay", async () => {
    const key = sha256(randomUUID());
    rateKeys.push(key);
    const token = await reserveSignup(db, key, "test@example.test");
    tokens.push(token);
    const event = (email: string, permit: string) =>
      JSON.stringify({
        user: { email, user_metadata: { signup_permit: permit } },
      });
    const hook = async (input: string) =>
      (
        await db.$queryRaw<
          Array<{ result: { error?: { http_code: number } } }>
        >`SELECT app.before_user_created(${input}::jsonb) AS result`
      )[0].result;
    expect(await hook(event("test@example.test", ""))).toHaveProperty(
      "error.http_code",
      403,
    );
    expect(await hook(event("other@example.test", token))).toHaveProperty(
      "error.http_code",
      403,
    );
    expect(await hook(event("test@example.test", token))).toEqual({});
    expect(await hook(event("test@example.test", token))).toHaveProperty(
      "error.http_code",
      403,
    );
    await expect(
      withUserDatabase(db, ids.owner, (tx) => tx.signupRateBucket.findMany()),
    ).rejects.toThrow();
  });
});

describe("Google onboarding safeguards", () => {
  it("allows only trusted verified Google creation, preserving email permit checks", async () => {
    const hook = async (user: object) =>
      (
        await db.$queryRaw<
          Array<{ result: { error?: object } }>
        >`SELECT app.before_user_created(${JSON.stringify({ user })}::jsonb) AS result`
      )[0].result;
    expect(
      await hook({
        email: "google@example.test",
        app_metadata: { provider: "google" },
        user_metadata: { email_verified: true },
      }),
    ).toEqual({});
    for (const user of [
      {
        email: "test@example.test",
        app_metadata: { provider: "email" },
        user_metadata: { provider: "google", email_verified: true },
      },
      {
        email: "test@example.test",
        app_metadata: { provider: "google" },
        user_metadata: { email_verified: false },
      },
      {
        app_metadata: { provider: "google" },
        user_metadata: { email_verified: true },
      },
    ])
      expect(await hook(user)).toHaveProperty("error.http_code", 403);
  });
  it("binds OAuth intent to scope, expiration and one use across clients", async () => {
    const key = sha256(randomUUID());
    rateKeys.push(key);
    const token = await reserveSignup(db, key, "oauth:google");
    tokens.push(token);
    expect(await consumeSignupPermit(db, token, "different-scope")).toBe(false);
    const results = await Promise.all([
      consumeSignupPermit(db, token, "oauth:google"),
      consumeSignupPermit(secondProcess, token, "oauth:google"),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const expired = await reserveSignup(db, key, "oauth:google");
    tokens.push(expired);
    await db.signupPermit.update({
      where: { tokenHash: sha256(expired) },
      data: { expiresAt: new Date(0) },
    });
    expect(await consumeSignupPermit(db, expired, "oauth:google")).toBe(false);
  });
});

describe("server onboarding quota for direct OAuth sessions", () => {
  it("charges new users once, allows existing profiles, and blocks provisioning at quota", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv(
      "SIGNUP_RATE_LIMIT_SECRET",
      "integration-only-secret-with-at-least-32-chars",
    );
    const headers = new Headers({ "x-vercel-forwarded-for": "192.0.2.48" });
    const key = signupNetworkHash(headers);
    rateKeys.push(key);
    try {
      const identity = { id: oauthUsers[0], displayName: "Google owner" };
      const first = await bootstrapWithQuota(db, identity, headers);
      const retry = await bootstrapWithQuota(secondProcess, identity, headers);
      expect(retry.id).toBe(first.id);
      expect(
        (
          await db.signupRateBucket.findUniqueOrThrow({
            where: { keyHash: sha256(`hour:${key}`) },
          })
        ).attempts,
      ).toBe(1);
      await db.signupRateBucket.update({
        where: { keyHash: sha256(`hour:${key}`) },
        data: { attempts: 5 },
      });
      await expect(
        bootstrapWithQuota(db, { id: oauthUsers[1] }, headers),
      ).rejects.toMatchObject({ status: 429 });
      expect(
        await db.userProfile.findUnique({ where: { id: oauthUsers[1] } }),
      ).toBeNull();
      expect((await bootstrapWithQuota(db, identity, headers)).id).toBe(
        first.id,
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
