import { describe, expect, it } from "vitest";
import {
  publicDemoAccounts,
  isExistingDemoEmail,
} from "../src/features/reviewer-demo/config";
import { productionSupabaseRef } from "../src/lib/config/deployment";
const backend = {
  NEXT_PUBLIC_SUPABASE_URL: `https://${productionSupabaseRef}.supabase.co`,
};
describe("public reviewer credentials", () => {
  it("publishes only the intentional existing-backend accounts", () => {
    const accounts = publicDemoAccounts(backend);
    expect(accounts.map((a) => a.email)).toEqual([
      "demo@admin.com",
      "demo@designer.com",
      "demo@client.com",
    ]);
    expect(accounts.every((a) => a.password === "0123456789")).toBe(true);
    expect(isExistingDemoEmail("DEMO@DESIGNER.COM")).toBe(true);
    expect(isExistingDemoEmail("customer@example.test")).toBe(false);
  });
  it("does not publish on an unrelated backend or when explicitly hidden", () => {
    expect(publicDemoAccounts({})).toEqual([]);
    expect(
      publicDemoAccounts({
        NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co",
      }),
    ).toEqual([]);
    expect(
      publicDemoAccounts({ ...backend, REVIEWER_DEMO_ENABLED: "false" }),
    ).toEqual([]);
  });
  it("rejects reuse of a private server secret", () => {
    expect(() =>
      publicDemoAccounts({ ...backend, SUPABASE_SECRET_KEY: "0123456789" }),
    ).toThrow("must not reuse");
  });
});
