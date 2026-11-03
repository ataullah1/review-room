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
      resendVerification: vi.fn().mockResolvedValue({ error: false }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: false }),
      updatePassword: vi.fn().mockResolvedValue({ error: false }),
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
    ).toEqual({ redirectTo: "/app" });
    expect(deps.reserveSignup).toHaveBeenCalledWith(input.email);
    expect(deps.provider.signUp).toHaveBeenCalledWith({
      ...input,
      permit: "one-use-permit",
    });
    expect(deps.bootstrap).toHaveBeenCalledWith(user, true);
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
  it("returns pending verification on no-session signup rather than claiming immediate login", async () => {
    const deps = dependencies();
    deps.provider.signUp.mockResolvedValue({ error: false, hasSession: false });
    const result = await authenticate("signup", input, deps);
    expect(result).toEqual({
      pendingVerification: true,
      email: input.email,
    });
    expect(deps.bootstrap).not.toHaveBeenCalled();
  });
  it("rejects login when email confirmation is pending", async () => {
    const deps = dependencies();
    deps.provider.signIn.mockResolvedValue({
      error: true,
      hasSession: false,
      unconfirmed: true,
    });
    await expect(authenticate("login", input, deps)).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining("confirm your email"),
    });
  });
  it("rejects no-session login results", async () => {
    const deps = dependencies();
    deps.provider.signIn.mockResolvedValue({ error: false, hasSession: false });
    await expect(authenticate("login", input, deps)).rejects.toMatchObject({
      status: 503,
    });
    expect(deps.bootstrap).not.toHaveBeenCalled();
  });
  it("supports resending signup verification emails", async () => {
    const deps = dependencies();
    deps.provider.resendVerification = vi
      .fn()
      .mockResolvedValue({ error: false });
    const result = await authenticate("resend", { email: input.email }, deps);
    expect(result).toEqual({
      ok: true,
      message: "If an account exists, a verification link has been sent.",
    });
    expect(deps.provider.resendVerification).toHaveBeenCalledWith({
      email: input.email,
    });
  });
  it("rate limits resend requests", async () => {
    const deps = dependencies();
    deps.provider.resendVerification = vi
      .fn()
      .mockResolvedValue({ error: true, rateLimited: true });
    await expect(
      authenticate("resend", { email: input.email }, deps),
    ).rejects.toMatchObject({
      status: 429,
    });
  });
  it("requests password recovery without account enumeration", async () => {
    const deps = dependencies();
    const result = await authenticate("recover", { email: input.email }, deps);
    expect(result).toEqual({
      ok: true,
      message: "If an account exists, instructions have been sent.",
    });
    expect(deps.provider.resetPasswordForEmail).toHaveBeenCalledWith({
      email: input.email,
    });
  });
  it("protects demo accounts from password recovery requests without disclosing existence", async () => {
    const deps = dependencies();
    const result = await authenticate(
      "recover",
      { email: "demo@admin.com" },
      deps,
    );
    expect(result).toEqual({
      ok: true,
      message: "If an account exists, instructions have been sent.",
    });
    expect(deps.provider.resetPasswordForEmail).not.toHaveBeenCalled();
  });
  it("validates recovery email format", async () => {
    const deps = dependencies();
    await expect(
      authenticate("recover", { email: "not-an-email" }, deps),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("rate limits recovery requests", async () => {
    const deps = dependencies();
    deps.provider.resetPasswordForEmail = vi
      .fn()
      .mockResolvedValue({ error: true, rateLimited: true });
    await expect(
      authenticate("recover", { email: input.email }, deps),
    ).rejects.toMatchObject({ status: 429 });
  });
  it("resets password with active recovery session and logs out", async () => {
    const deps = dependencies();
    const result = await authenticate(
      "reset-password",
      { password: "new-valid-password-123" },
      deps,
    );
    expect(result).toEqual({ redirectTo: "/login?reset=success" });
    expect(deps.provider.updatePassword).toHaveBeenCalledWith({
      password: "new-valid-password-123",
    });
    expect(deps.provider.signOut).toHaveBeenCalled();
  });
  it("validates password length on reset", async () => {
    const deps = dependencies();
    await expect(
      authenticate("reset-password", { password: "short" }, deps),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("rejects password reset without active session", async () => {
    const deps = dependencies();
    deps.provider.getUser = vi.fn().mockResolvedValue(null);
    await expect(
      authenticate(
        "reset-password",
        { password: "new-valid-password-123" },
        deps,
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("blocks password reset on public demo accounts", async () => {
    const deps = dependencies();
    deps.provider.getUser = vi.fn().mockResolvedValue({
      id: "demo-user-id",
      email: "demo@designer.com",
    });
    await expect(
      authenticate(
        "reset-password",
        { password: "new-valid-password-123" },
        deps,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(deps.provider.updatePassword).not.toHaveBeenCalled();
  });
  it("logs in using a fresh verified user and handles invalid credentials", async () => {
    const deps = dependencies();
    expect(await authenticate("login", input, deps)).toEqual({
      redirectTo: "/app",
    });
    expect(
      await authenticate(
        "login",
        { ...input, next: "/app/shared/projects" },
        deps,
      ),
    ).toEqual({ redirectTo: "/app/shared/projects" });
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
