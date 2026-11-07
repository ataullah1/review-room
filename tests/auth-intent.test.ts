import { describe, expect, it, vi } from "vitest";
import { signAuthIntent, readAuthIntent } from "../src/lib/auth/intent";
import { authenticate } from "../src/lib/auth/core";
const secret = "private-test-signing-secret-at-least-32-characters";
describe("scoped recovery intents", () => {
  it("rejects tampering, wrong purpose, expiration and missing secret", () => {
    const value = signAuthIntent(
      {
        kind: "recovery-grant",
        email: "a@example.test",
        userId: "a",
        sessionId: "s",
        expires: 2000,
      },
      secret,
    );
    expect(
      readAuthIntent(value, "recovery-grant", secret, 1000)?.sessionId,
    ).toBe("s");
    expect(
      readAuthIntent(value + "x", "recovery-grant", secret, 1000),
    ).toBeNull();
    expect(readAuthIntent(value, "recovery-start", secret, 1000)).toBeNull();
    expect(readAuthIntent(value, "recovery-grant", secret, 2000)).toBeNull();
    expect(readAuthIntent(value, "recovery-grant", "", 1000)).toBeNull();
  });
  it("an ordinary signed-in account cannot reset without a recovery grant", async () => {
    const updatePassword = vi.fn();
    const deps = {
      provider: {
        getUser: vi
          .fn()
          .mockResolvedValue({ id: "a", email: "a@example.test" }),
        updatePassword,
      },
    };
    await expect(
      authenticate(
        "reset-password",
        { password: "long-new-password" },
        deps as never,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(updatePassword).not.toHaveBeenCalled();
  });
});
