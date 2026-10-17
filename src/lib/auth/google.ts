import { AuthFlowError } from "./errors";
export const googleIntentCookie = "rr-google-intent";
export const googleIntentScope = "oauth:google";
export function googleAuthorizationUrl(value: string, supabaseUrl: string) {
  const url = new URL(value);
  if (
    url.origin !== new URL(supabaseUrl).origin ||
    url.pathname !== "/auth/v1/authorize" ||
    url.searchParams.get("provider") !== "google"
  )
    throw new AuthFlowError(
      "Google sign-in is unavailable. Please try again later.",
      503,
    );
  return url.toString();
}
export async function beginGoogle(deps: {
  enabled(): Promise<boolean>;
  reserve(): Promise<string>;
  authorize(): Promise<string>;
  discard(token: string): Promise<void>;
  supabaseUrl: string;
}) {
  if (!(await deps.enabled()))
    throw new AuthFlowError(
      "Google sign-in is not configured yet. Please use email and password.",
      503,
    );
  const token = await deps.reserve();
  try {
    return {
      token,
      redirectTo: googleAuthorizationUrl(
        await deps.authorize(),
        deps.supabaseUrl,
      ),
    };
  } catch (error) {
    await deps.discard(token);
    throw error;
  }
}

export async function finishGoogle(
  input: { code: string | null; token?: string; providerError: boolean },
  deps: {
    consume(token: string): Promise<boolean>;
    exchange(code: string): Promise<boolean>;
    verifiedUser(): Promise<
      import("../data/bootstrap").VerifiedIdentity | null
    >;
    bootstrap(
      user: import("../data/bootstrap").VerifiedIdentity,
    ): Promise<{ id: string }>;
  },
) {
  if (
    !input.code ||
    !input.token ||
    input.providerError ||
    !(await deps.consume(input.token))
  )
    throw new AuthFlowError(
      "Google sign-in did not finish. Please try again.",
      401,
    );
  if (!(await deps.exchange(input.code)))
    throw new AuthFlowError(
      "Google sign-in did not finish. Please try again.",
      401,
    );
  const user = await deps.verifiedUser();
  if (!user)
    throw new AuthFlowError(
      "Google sign-in did not finish. Please try again.",
      401,
    );
  const workspace = await deps.bootstrap(user);
  return `/app/${workspace.id}/projects`;
}
