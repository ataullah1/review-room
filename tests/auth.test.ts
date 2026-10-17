import { describe, expect, it, vi } from "vitest";
import { authenticate, type AuthDependencies } from "../src/lib/auth/core";
import { signupNetworkHash } from "../src/lib/auth/ip";
import { safeReturnPath, requireSameOrigin } from "../src/lib/auth/validation";
import { AuthFlowError } from "../src/lib/auth/errors";
const user = {
  id: "10000000-0000-4000-8000-000000000001",
  email: "test@example.test",
};
const input = {
  displayName: "Test owner",
  email: user.email,
  password: "long-test-password",
};
function dependencies() {
  return {
    provider: {
      signUp: vi.fn().mockResolvedValue({ error: false, hasSession: true }),
      signIn: vi.fn().mockResolvedValue({ error: false, hasSession: true }),
      getUser: vi.fn().mockResolvedValue(user),
      signOut: vi.fn().mockResolvedValue(true),
    },
    reserveSignup: vi.fn().mockResolvedValue("one-use-permit"),
    discardPermit: vi.fn().mockResolvedValue(undefined),
    assertInstantSignup: vi.fn().mockResolvedValue(undefined),
    bootstrap: vi.fn().mockResolvedValue({ id: "workspace-id" }),
  } satisfies AuthDependencies;
}
describe("authentication flow", () => {
  it("signs up, verifies identity and bootstraps before returning a workspace", async () => {
    const deps = dependencies();
    expect(
      await authenticate("signup", { ...input, role: "OWNER" }, deps),
    ).toEqual({ redirectTo: "/app/workspace-id/projects" });
    expect(deps.reserveSignup).toHaveBeenCalledWith(input.email);
    expect(deps.provider.signUp).toHaveBeenCalledWith({
      ...input,
      permit: "one-use-permit",
    });
    expect(deps.bootstrap).toHaveBeenCalledWith(user);
    expect(deps.discardPermit).toHaveBeenCalledWith("one-use-permit");
  });
  it("does not create an account or send email when confirmation remains on", async () => {
    const deps = dependencies();
    deps.assertInstantSignup.mockRejectedValue(
      new AuthFlowError("Unavailable", 503),
    );
    await expect(authenticate("signup", input, deps)).rejects.toMatchObject({
      status: 503,
    });
    expect(deps.provider.signUp).not.toHaveBeenCalled();
    expect(deps.bootstrap).not.toHaveBeenCalled();
    expect(deps.discardPermit).toHaveBeenCalled();
  });
  it("enforces the durable limiter before calling Supabase", async () => {
    const deps = dependencies();
    deps.reserveSignup.mockRejectedValue(
      new AuthFlowError("Limited", 429, 3600),
    );
    await expect(authenticate("signup", input, deps)).rejects.toMatchObject({
      status: 429,
    });
    expect(deps.provider.signUp).not.toHaveBeenCalled();
  });
  it("does not call providers on invalid signup data", async () => {
    const deps = dependencies();
    await expect(
      authenticate("signup", { ...input, password: "short" }, deps),
    ).rejects.toMatchObject({ status: 400 });
    expect(deps.reserveSignup).not.toHaveBeenCalled();
  });
  it("rejects no-session signup results rather than claiming immediate login", async () => {
    const deps = dependencies();
    deps.provider.signUp.mockResolvedValue({ error: false, hasSession: false });
    await expect(authenticate("signup", input, deps)).rejects.toMatchObject({
      status: 503,
    });
    expect(deps.bootstrap).not.toHaveBeenCalled();
  });
  it("logs in using a fresh verified user and handles invalid credentials", async () => {
    const deps = dependencies();
    await authenticate("login", input, deps);
    expect(deps.provider.getUser).toHaveBeenCalled();
    expect(deps.reserveSignup).not.toHaveBeenCalled();
    deps.provider.signIn.mockResolvedValue({ error: true, hasSession: false });
    await expect(authenticate("login", input, deps)).rejects.toMatchObject({
      status: 401,
    });
  });
  it("does not trust a successful provider response without a verified user", async () => {
    const deps = dependencies();
    deps.provider.getUser.mockResolvedValue(null);
    await expect(authenticate("login", input, deps)).rejects.toMatchObject({
      status: 401,
    });
    expect(deps.bootstrap).not.toHaveBeenCalled();
  });
  it("propagates Supabase built-in rate limiting", async () => {
    const deps = dependencies();
    deps.provider.signIn.mockResolvedValue({
      error: true,
      hasSession: false,
      rateLimited: true,
    });
    await expect(authenticate("login", input, deps)).rejects.toMatchObject({
      status: 429,
    });
  });
  it("logs out and does not report success when provider logout fails", async () => {
    const deps = dependencies();
    expect(await authenticate("logout", {}, deps)).toEqual({
      redirectTo: "/login",
    });
    expect(deps.bootstrap).not.toHaveBeenCalled();
    deps.provider.signOut.mockResolvedValue(false);
    await expect(authenticate("logout", {}, deps)).rejects.toMatchObject({
      status: 503,
    });
  });
  it("requires identity for retried workspace bootstrap", async () => {
    const deps = dependencies();
    deps.provider.getUser.mockResolvedValue(null);
    await expect(authenticate("bootstrap", {}, deps)).rejects.toMatchObject({
      status: 401,
    });
  });
});
describe("request trust", () => {
  const env = {
    VERCEL: "1",
    NODE_ENV: "production",
    SIGNUP_RATE_LIMIT_SECRET: "a-private-test-secret-with-32-characters",
  };
  it("hashes only Vercel's trusted header, ignoring other forwarded fields", () => {
    const headers = new Headers({
      "x-vercel-forwarded-for": "192.0.2.1",
      "x-forwarded-for": "198.51.100.2",
      "x-real-ip": "198.51.100.3",
    });
    const key = signupNetworkHash(headers, env);
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    headers.set("x-forwarded-for", "203.0.113.1");
    expect(signupNetworkHash(headers, env)).toBe(key);
    expect(key).not.toContain("192.0.2.1");
  });
  it("rejects spoofed/non-Vercel/missing/multi-address headers in production", () => {
    expect(() =>
      signupNetworkHash(new Headers({ "x-forwarded-for": "192.0.2.1" }), env),
    ).toThrow();
    expect(() =>
      signupNetworkHash(
        new Headers({ "x-vercel-forwarded-for": "192.0.2.1,198.51.100.1" }),
        env,
      ),
    ).toThrow();
    expect(() =>
      signupNetworkHash(
        new Headers({ "x-vercel-forwarded-for": "192.0.2.1" }),
        { ...env, VERCEL: undefined },
      ),
    ).toThrow();
  });
  it("normalizes IPv6 and uses one shared development quota without reading client IPs", () => {
    expect(
      signupNetworkHash(
        new Headers({ "x-vercel-forwarded-for": "2001:0db8:0:0:0:0:0:1" }),
        env,
      ),
    ).toBe(
      signupNetworkHash(
        new Headers({ "x-vercel-forwarded-for": "2001:db8::1" }),
        env,
      ),
    );
    const dev = { ...env, VERCEL: undefined, NODE_ENV: "development" };
    expect(signupNetworkHash(new Headers(), dev)).toBe(
      signupNetworkHash(
        new Headers({ "x-vercel-forwarded-for": "192.0.2.1" }),
        dev,
      ),
    );
  });
  it("fails closed without a stable HMAC secret", () => {
    expect(() =>
      signupNetworkHash(new Headers(), { NODE_ENV: "development" }),
    ).toThrow();
  });
  it("rejects cross-origin auth posts and unsafe return destinations", () => {
    const config = { NEXT_PUBLIC_APP_URL: "https://review.example" };
    expect(
      requireSameOrigin(
        new Headers({ origin: "https://evil.example" }),
        config,
      ),
    ).toBe(false);
    expect(requireSameOrigin(new Headers(), config)).toBe(false);
    expect(
      requireSameOrigin(
        new Headers({ origin: "https://review.example" }),
        config,
      ),
    ).toBe(true);
    for (const path of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/app/%2f%2fevil.example",
      "/auth/logout",
    ])
      expect(safeReturnPath(path)).toBe("/app");
    expect(safeReturnPath("/app/workspace/projects")).toBe(
      "/app/workspace/projects",
    );
  });
});
