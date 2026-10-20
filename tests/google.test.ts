import { describe, expect, it, vi } from "vitest";
import {
  beginGoogle,
  finishGoogle,
  googleAuthorizationUrl,
} from "../src/lib/auth/google";
const supabaseUrl = "https://example.supabase.co";
const authorizeUrl = `${supabaseUrl}/auth/v1/authorize?provider=google&code_challenge=test`;
function startDeps() {
  return {
    enabled: vi.fn().mockResolvedValue(true),
    reserve: vi.fn().mockResolvedValue("intent"),
    authorize: vi.fn().mockResolvedValue(authorizeUrl),
    discard: vi.fn().mockResolvedValue(undefined),
    supabaseUrl,
  };
}
function finishDeps() {
  return {
    consume: vi.fn().mockResolvedValue(true),
    exchange: vi.fn().mockResolvedValue(true),
    verifiedUser: vi.fn().mockResolvedValue({ id: "verified-google-id" }),
    bootstrap: vi.fn().mockResolvedValue({ id: "workspace" }),
  };
}
const input = { code: "pkce-code", token: "intent", providerError: false };
describe("Google OAuth", () => {
  it("reserves durable quota before authorization", async () => {
    const deps = startDeps();
    expect(await beginGoogle(deps)).toEqual({
      token: "intent",
      redirectTo: authorizeUrl,
    });
    expect(deps.reserve.mock.invocationCallOrder[0]).toBeLessThan(
      deps.authorize.mock.invocationCallOrder[0],
    );
  });
  it("handles an unconfigured provider without consuming quota", async () => {
    const deps = startDeps();
    deps.enabled.mockResolvedValue(false);
    await expect(beginGoogle(deps)).rejects.toMatchObject({ status: 503 });
    expect(deps.reserve).not.toHaveBeenCalled();
  });
  it("does not authorize when rate limited", async () => {
    const deps = startDeps();
    deps.reserve.mockRejectedValue({ status: 429 });
    await expect(beginGoogle(deps)).rejects.toMatchObject({ status: 429 });
    expect(deps.authorize).not.toHaveBeenCalled();
  });
  it("discards intents after provider failure", async () => {
    const deps = startDeps();
    deps.authorize.mockRejectedValue(new Error("provider failure"));
    await expect(beginGoogle(deps)).rejects.toThrow();
    expect(deps.discard).toHaveBeenCalledWith("intent");
  });
  it.each([
    "https://evil.test/auth/v1/authorize?provider=google",
    `${supabaseUrl}/auth/v1/authorize?provider=github`,
    `${supabaseUrl}/other?provider=google`,
  ])("rejects unsafe provider URLs: %s", (url) => {
    expect(() => googleAuthorizationUrl(url, supabaseUrl)).toThrow();
  });
  it("verifies the provider user before idempotent bootstrap", async () => {
    const deps = finishDeps();
    expect(await finishGoogle(input, deps)).toBe("/app");
    expect(deps.exchange).toHaveBeenCalledWith("pkce-code");
    expect(deps.bootstrap).toHaveBeenCalledWith({ id: "verified-google-id" });
  });
  it.each([
    { ...input, code: null },
    { ...input, token: undefined },
    { ...input, providerError: true },
  ])("rejects incomplete or cancelled callbacks", async (value) => {
    const deps = finishDeps();
    await expect(finishGoogle(value, deps)).rejects.toMatchObject({
      status: 401,
    });
    expect(deps.bootstrap).not.toHaveBeenCalled();
    expect(deps.exchange).not.toHaveBeenCalled();
  });
  it("rejects expired or replayed intents before exchange", async () => {
    const deps = finishDeps();
    deps.consume.mockResolvedValue(false);
    await expect(finishGoogle(input, deps)).rejects.toThrow();
    expect(deps.exchange).not.toHaveBeenCalled();
  });
  it("rejects failed PKCE exchanges and unverified identities", async () => {
    for (const step of ["exchange", "verifiedUser"] as const) {
      const deps = finishDeps();
      deps[step].mockResolvedValue(step === "exchange" ? false : null);
      await expect(finishGoogle(input, deps)).rejects.toThrow();
      expect(deps.bootstrap).not.toHaveBeenCalled();
    }
  });
});
