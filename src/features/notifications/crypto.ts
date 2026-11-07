import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
function key(secret: string) {
  if (!/^[a-f0-9]{64}$/i.test(secret))
    throw new Error(
      "Mail encryption requires an independent 32-byte hex secret.",
    );
  return Buffer.from(secret, "hex");
}
export function sealMail(value: unknown, secret: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const bytes = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("hex"),
    cipher.getAuthTag().toString("hex"),
    bytes.toString("base64url"),
  ].join(".");
}
export function openMail(value: string, secret: string): unknown {
  const [version, iv, tag, bytes, extra] = value.split(".");
  if (version !== "v1" || extra || !iv || !tag || !bytes)
    throw new Error("Invalid encrypted mail intent.");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key(secret),
    Buffer.from(iv, "hex"),
  );
  cipher.setAuthTag(Buffer.from(tag, "hex"));
  return JSON.parse(
    Buffer.concat([
      cipher.update(Buffer.from(bytes, "base64url")),
      cipher.final(),
    ]).toString("utf8"),
  );
}
export function mailEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  return (
    env.MAIL_ENABLED === "true" &&
    /^[a-f0-9]{64}$/i.test(env.MAIL_PAYLOAD_SECRET || "") &&
    !!env.MAIL_API_KEY &&
    !!env.MAIL_FROM &&
    env.MAIL_API_URL?.startsWith("https://")
  );
}
