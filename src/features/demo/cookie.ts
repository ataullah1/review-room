import {
  createHmac,
  timingSafeEqual,
  randomBytes,
  randomUUID,
  createHash,
} from "node:crypto";
import { z } from "zod";
export const demoCookie = "rr_demo";
export type DemoIdentity = { id: string; tokenHash: string; expires: number };
function signingKey(env: Record<string, string | undefined>) {
  const key = env.SIGNUP_RATE_LIMIT_SECRET;
  if (!key || key.length < 32)
    throw new Error("Demo session signing is unavailable.");
  return key;
}
const sign = (value: string, key: string) =>
  createHmac("sha256", key)
    .update(`review-room-demo:v1:${value}`)
    .digest("hex");
export function newDemoIdentity() {
  return { id: randomUUID(), token: randomBytes(32).toString("hex") };
}
export function signDemoCookie(
  id: string,
  token: string,
  expires: number,
  env: Record<string, string | undefined> = process.env,
) {
  const value = `${id}.${token}.${expires}`;
  return `${value}.${sign(value, signingKey(env))}`;
}
export function readDemoCookie(
  cookie: string | undefined,
  env: Record<string, string | undefined> = process.env,
  now = Date.now(),
): DemoIdentity | null {
  if (!cookie || cookie.length > 240) return null;
  const parts = cookie.split(".");
  if (parts.length !== 4) return null;
  const [id, token, expiry, signature] = parts;
  if (
    !z.uuid().safeParse(id).success ||
    !/^[a-f0-9]{64}$/.test(token) ||
    !/^[a-f0-9]{64}$/.test(signature) ||
    !/^[0-9]{13}$/.test(expiry)
  )
    return null;
  const value = parts.slice(0, 3).join("."),
    expected = sign(value, signingKey(env)),
    expires = Number(expiry);
  if (
    !timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex"),
    ) ||
    expires <= now
  )
    return null;
  return {
    id,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    expires,
  };
}
