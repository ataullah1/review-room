import { describe, it, expect } from "vitest";
import {
  makeToken,
  hashToken,
  tokenInput,
  inviteInput,
} from "../src/features/sharing/tokens";
import { safeReturnPath } from "../src/lib/auth/validation";
describe("invitation/share inputs", () => {
  it("generates distinct high entropy tokens and only accepts their full shape", () => {
    const a = makeToken(),
      b = makeToken();
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).not.toBe(b);
    expect(hashToken(a)).not.toBe(a);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(tokenInput.safeParse(a.slice(1)).success).toBe(false);
  });
  it("normalizes email and prevents OWNER invitations", () => {
    expect(
      inviteInput.parse({ email: "Client@Example.com", role: "CLIENT" }).email,
    ).toBe("client@example.com");
    expect(
      inviteInput.safeParse({ email: "x@example.com", role: "OWNER" }).success,
    ).toBe(false);
    expect(
      inviteInput.safeParse({ email: "bad", role: "DESIGNER" }).success,
    ).toBe(false);
  });
  it("permits only the fixed invitation return route in addition to private app paths", () => {
    expect(safeReturnPath("/invite/accept")).toBe("/invite/accept");
    for (const path of [
      "//evil.test",
      "/invite/accept?token=secret",
      "/invite/accept/evil",
      "https://evil.test",
    ])
      expect(safeReturnPath(path)).toBe("/app");
  });
});
