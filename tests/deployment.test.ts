import { databaseConnectionOptions } from "../src/lib/config/database-connection";
import { describe, it, expect, vi } from "vitest";
import {
  assertPreviewIsolation,
  assertHostedTestTarget,
  databaseBelongsToProject,
  isProductionDeployment,
  productionOrigin,
  productionSupabaseRef,
} from "../src/lib/config/deployment";
import { maintenanceResponse } from "../src/features/maintenance/handler";
import {
  readDatabaseEnvironment,
  readStorageEnvironment,
} from "../src/lib/config/environment";
const ref = "abcdefghijklmnopqrst";
const preview = {
  VERCEL_ENV: "preview",
  PREVIEW_SUPABASE_PROJECT_REF: ref,
  NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
  DATABASE_URL: `postgresql://postgres.${ref}:private-password@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`,
};
describe("deployment isolation", () => {
  it("uses the supplied production origin and distinguishes Preview/local builds", () => {
    expect(productionOrigin).toBe("https://rreviewroom.vercel.app");
    expect(isProductionDeployment({ VERCEL_ENV: "production" })).toBe(true);
    expect(isProductionDeployment({ VERCEL_ENV: "preview" })).toBe(false);
    expect(isProductionDeployment({})).toBe(false);
  });
  it("fails closed for missing/production/mixed Preview credentials", () => {
    for (const env of [
      { VERCEL_ENV: "preview" },
      { ...preview, PREVIEW_SUPABASE_PROJECT_REF: productionSupabaseRef },
      {
        ...preview,
        NEXT_PUBLIC_SUPABASE_URL: `https://${productionSupabaseRef}.supabase.co`,
      },
      {
        ...preview,
        DATABASE_URL: preview.DATABASE_URL.replace(ref, productionSupabaseRef),
      },
      {
        ...preview,
        DIRECT_URL: preview.DATABASE_URL.replace(ref, productionSupabaseRef),
      },
      {
        ...preview,
        DATABASE_URL: preview.DATABASE_URL + "?host=production.example",
      },
    ]) {
      expect(() => assertPreviewIsolation(env)).toThrow(
        "Production access is disabled",
      );
      expect(() => readDatabaseEnvironment(env)).toThrow();
      expect(() => readStorageEnvironment(env)).toThrow();
    }
  });
  it("allows a coherent separate Preview backend and protects hosted fixtures", () => {
    expect(() => assertPreviewIsolation(preview)).not.toThrow();
    expect(
      databaseBelongsToProject(
        `postgresql://postgres@db.${ref}.supabase.co/postgres`,
        ref,
      ),
    ).toBe(true);
    expect(() =>
      assertHostedTestTarget({
        ...preview,
        HOSTED_TEST_PROJECT_REF: ref,
        DIRECT_URL: preview.DATABASE_URL,
      }),
    ).not.toThrow();
    expect(() =>
      assertHostedTestTarget({
        ...preview,
        HOSTED_TEST_PROJECT_REF: productionSupabaseRef,
      }),
    ).toThrow("live project is protected");
    expect(() => assertHostedTestTarget({})).toThrow();
    expect(() =>
      assertPreviewIsolation({ VERCEL_ENV: "production" }),
    ).not.toThrow();
  });
});
describe("maintenance authorization and safe responses", () => {
  const secret = "test-cron-secret-with-at-least-32-characters";
  it("does not call cleanup or log for absent, short or invalid secrets", async () => {
    for (const [configured, header] of [
      [undefined, ""],
      ["short", "Bearer short"],
      [secret, "Bearer wrong"],
      [secret, secret],
    ] as const) {
      const cleanup = vi.fn(),
        log = vi.fn();
      const response = await maintenanceResponse(
        new Request("https://example.test/api/maintenance", {
          headers: { authorization: header },
        }),
        { secret: configured, cleanup, log },
      );
      expect(response.status).toBe(401);
      expect(cleanup).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    }
  });
  it("runs the bounded cleanup only with valid Bearer authorization", async () => {
    const cleanup = vi.fn().mockResolvedValue({
        demo: { removed: 2 },
        uploads: { examined: 5, cleaned: 5 },
      }),
      log = vi.fn();
    const response = await maintenanceResponse(
      new Request("https://example.test/api/maintenance", {
        headers: { authorization: `Bearer ${secret}` },
      }),
      { secret, cleanup, log },
    );
    expect(response.status).toBe(200);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toMatchObject({
      demo: { removed: 2 },
      uploads: { examined: 5, cleaned: 5 },
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
  });
  it("reports partial storage cleanup as retryable with durable work still queued", async () => {
    const cleanup = vi.fn().mockResolvedValue({
        demo: { removed: 0 },
        uploads: { examined: 5, cleaned: 2 },
      }),
      log = vi.fn();
    const response = await maintenanceResponse(
      new Request("https://example.test/api/maintenance", {
        headers: { authorization: `Bearer ${secret}` },
      }),
      { secret, cleanup, log },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      uploads: { examined: 5, cleaned: 2 },
    });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ status: "partial" }),
    );
  });
  it("sanitizes dependency failures and returns a correlated retryable error", async () => {
    const log = vi.fn(),
      cleanup = vi
        .fn()
        .mockRejectedValue(new Error("private-token-and-signed-url"));
    const response = await maintenanceResponse(
      new Request("https://example.test/api/maintenance", {
        headers: { authorization: `Bearer ${secret}` },
      }),
      { secret, cleanup, log },
    );
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain("requestId");
    expect(body + JSON.stringify(log.mock.calls)).not.toContain(
      "private-token-and-signed-url",
    );
  });
});

describe("production database transport", () => {
  it("requires a CA on deployed backends and keeps verification enabled", () => {
    const base = {
      VERCEL_ENV: "production",
      VERCEL: "1",
      DATABASE_URL:
        "postgresql://user:password@pool.example/postgres?sslmode=no-verify",
    };
    expect(() => databaseConnectionOptions(base)).toThrow("CA certificate");
    const config = databaseConnectionOptions({
      ...base,
      SUPABASE_DB_CA_CERT:
        "-----BEGIN CERTIFICATE-----\\nfixture-ca\\n-----END CERTIFICATE-----",
    });
    expect(config.max).toBe(1);
    expect(config.ssl).toEqual({
      ca: "-----BEGIN CERTIFICATE-----\nfixture-ca\n-----END CERTIFICATE-----",
      rejectUnauthorized: true,
    });
    expect(config.connectionString).not.toContain("no-verify");
  });
  it("preserves the local PostgreSQL development/test path without TLS requirements", () => {
    const config = databaseConnectionOptions({
      DATABASE_URL:
        "postgresql://review_room_local@127.0.0.1:55432/review_room_test",
    });
    expect(config.ssl).toBeUndefined();
    expect(config.max).toBe(5);
  });
});
