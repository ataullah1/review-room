import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { AuthFlowError } from "./errors";

export function signupNetworkHash(
  headers: Pick<Headers, "get">,
  env: Record<string, string | undefined> = process.env,
) {
  const secret = env.SIGNUP_RATE_LIMIT_SECRET;
  if (!secret || secret.length < 32)
    throw new AuthFlowError(
      "Signup is temporarily unavailable. Please try again later.",
      503,
    );
  let identity: string;
  if (env.VERCEL === "1") {
    // Vercel overwrites this header at its edge. Never fall back to forwarded-for,
    // real-ip or a request body field. Outside Vercel it is untrusted.
    const ip = headers.get("x-vercel-forwarded-for")?.trim();
    if (!ip || !isIP(ip))
      throw new AuthFlowError(
        "Signup is temporarily unavailable. Please try again later.",
        503,
      );
    identity = isIP(ip) === 6 ? new URL(`http://[${ip}]/`).hostname : ip;
  } else if (env.NODE_ENV === "development") {
    // Local requests have no trusted client IP. All share one durable dev quota;
    // client-supplied headers cannot create additional identities.
    identity = "local-development-shared-quota";
  } else {
    throw new AuthFlowError(
      "Signup requires a supported deployment. Please try again later.",
      503,
    );
  }
  return createHmac("sha256", secret)
    .update(`signup-network:v1:${identity}`)
    .digest("hex");
}
