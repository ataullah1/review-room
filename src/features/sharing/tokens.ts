import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
export const tokenInput = z.string().regex(/^[a-f0-9]{64}$/);
export const hashToken = (token: string) =>
  createHash("sha256").update(tokenInput.parse(token)).digest("hex");
export const makeToken = () => randomBytes(32).toString("hex");
export const inviteInput = z.object({
  email: z.email().trim().toLowerCase().max(254),
  role: z.enum(["CLIENT", "DESIGNER"]),
});
