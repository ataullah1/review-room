import { it, expect } from "vitest";
import {
  mailEnabled,
  sealMail,
  openMail,
} from "../src/features/notifications/crypto";
it("keeps invitation capabilities encrypted and authenticates ciphertext", () => {
  const key = "a".repeat(64),
    token = "b".repeat(64),
    sealed = sealMail({ token, email: "test@example.test" }, key);
  expect(sealed).not.toContain(token);
  expect(sealed).not.toContain("test@example.test");
  expect(openMail(sealed, key)).toEqual({ token, email: "test@example.test" });
  expect(() => openMail(sealed, "c".repeat(64))).toThrow();
  expect(() => openMail(sealed + "x", key)).toThrow();
});
it("fails closed when application mail is unconfigured", () => {
  expect(mailEnabled({})).toBeFalsy();
  expect(
    mailEnabled({
      MAIL_ENABLED: "true",
      MAIL_API_URL: "http://untrusted",
      MAIL_API_KEY: "private",
      MAIL_FROM: "sender@example.test",
      MAIL_PAYLOAD_SECRET: "a".repeat(64),
    }),
  ).toBeFalsy();
});
