import { describe, expect, it } from "vitest";
import {
  readDatabaseEnvironment,
  readStorageEnvironment,
} from "../src/lib/config/environment";
import { assertLocalDatabase } from "../prisma/local-safety";

const local = "postgresql://review_room_local@127.0.0.1:55432/";
describe("configuration boundaries", () => {
  it("accepts PostgreSQL and rejects missing/non-database URLs without exposing input", () => {
    expect(
      readDatabaseEnvironment({ DATABASE_URL: `${local}review_room_dev` })
        .DATABASE_URL,
    ).toContain("review_room_dev");
    for (const value of [
      undefined,
      "https://example.com/secret",
      "postgresql://bad-secret",
    ]) {
      expect(() => readDatabaseEnvironment({ DATABASE_URL: value })).toThrow(
        "DATABASE_URL must be configured",
      );
      try {
        readDatabaseEnvironment({ DATABASE_URL: value });
      } catch (error) {
        expect(String(error)).not.toContain("bad-secret");
      }
    }
  });
  it("does not treat empty storage placeholders as configured", () => {
    expect(() =>
      readStorageEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "",
        SUPABASE_SECRET_KEY: "",
        SUPABASE_STORAGE_BUCKET: "review-room-private",
      }),
    ).toThrow("storage is not configured");
  });
});
describe("fixture write protection", () => {
  it("accepts only the project's dedicated loopback databases", () => {
    expect(assertLocalDatabase(`${local}review_room_dev`, "seed")).toContain(
      "review_room_dev",
    );
    expect(assertLocalDatabase(`${local}review_room_test`, "test")).toContain(
      "review_room_test",
    );
  });
  it.each([
    "postgresql://review_room_local@production.example:55432/review_room_test",
    `${local}postgres`,
    `${local}review_room_dev`,
    "postgresql://review_room_local@127.0.0.1:5432/review_room_test",
    "postgresql://other@127.0.0.1:55432/review_room_test",
    "https://review_room_local@127.0.0.1:55432/review_room_test",
    `${local}review_room_test?host=production.example`,
    `${local}review_room_test?dbname=production`,
    `${local}review_room_test?options=-csearch_path=public`,
    "invalid",
  ])("rejects unsafe test targets: %s", (target) => {
    expect(() => assertLocalDatabase(target, "test")).toThrow();
  });
});
