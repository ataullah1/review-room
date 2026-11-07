import { createHmac, timingSafeEqual } from "node:crypto";
// A scoped, short-lived browser intent. This is not an Auth session or mailbox
// proof. Recovery grants are minted only after a provider callback succeeds.
export type AuthIntent = {
  kind: "recovery-start" | "recovery-grant";
  email: string;
  userId?: string;
  sessionId?: string;
  nonce?: string;
  expires: number;
};
export const recoveryStartCookie = "rr_recovery_start";
export const recoveryGrantCookie = "rr_recovery_grant";
function signature(value: string, secret: string) {
  if (secret.length < 32)
    throw new Error("A private Auth signing secret is required.");
  return createHmac("sha256", secret)
    .update(`auth-intent:v1:${value}`)
    .digest("hex");
}
export function signAuthIntent(
  intent: AuthIntent,
  secret = process.env.SIGNUP_RATE_LIMIT_SECRET || "",
): string {
  const payload = Buffer.from(JSON.stringify(intent)).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}
export function readAuthIntent(
  value: string | undefined,
  kind: AuthIntent["kind"],
  secret = process.env.SIGNUP_RATE_LIMIT_SECRET || "",
  now = Date.now(),
): AuthIntent | null {
  try {
    if (!value || value.length > 2048) return null;
    const [payload, supplied, extra] = value.split(".");
    if (!payload || !supplied || extra) return null;
    const expected = signature(payload, secret);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    )
      return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.kind === kind &&
      typeof data.email === "string" &&
      Number.isFinite(data.expires) &&
      data.expires > now
      ? data
      : null;
  } catch {
    return null;
  }
}
export const intentCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 600,
};
