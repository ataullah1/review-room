import { AuthFlowError } from "./errors";
import { loginSchema, signupSchema, safeReturnPath } from "./validation";
import type { VerifiedIdentity } from "../data/bootstrap";

export type AuthOperation =
  "signup" | "login" | "logout" | "bootstrap" | "resend";
export type ProviderResult = {
  error: boolean;
  rateLimited?: boolean;
  hasSession: boolean;
  unconfirmed?: boolean;
};
export type AuthenticateResult =
  | { redirectTo: string }
  | { pendingVerification: true; email: string }
  | { ok: true; message: string };

export interface AuthDependencies {
  provider: {
    signUp(input: {
      email: string;
      password: string;
      displayName: string;
      permit: string;
    }): Promise<ProviderResult>;
    signIn(input: { email: string; password: string }): Promise<ProviderResult>;
    resendVerification?(input: {
      email: string;
    }): Promise<{ error: boolean; rateLimited?: boolean }>;
    getUser(): Promise<VerifiedIdentity | null>;
    signOut(): Promise<boolean>;
  };
  reserveSignup(email: string): Promise<string>;
  discardPermit(permit: string): Promise<void>;
  assertInstantSignup(): Promise<void>;
  bootstrap(
    user: VerifiedIdentity,
    quotaReserved: boolean,
  ): Promise<{ id: string }>;
}

export async function authenticate(
  operation: AuthOperation,
  input: unknown,
  deps: AuthDependencies,
): Promise<AuthenticateResult> {
  if (operation === "logout") {
    if (!(await deps.provider.signOut()))
      throw new AuthFlowError("Could not log out. Please try again.", 503);
    return { redirectTo: "/login" };
  }
  if (operation === "resend") {
    const parsed = loginSchema.pick({ email: true }).safeParse(input);
    if (!parsed.success)
      throw new AuthFlowError("Enter a valid email address.", 400);
    if (deps.provider.resendVerification) {
      const res = await deps.provider.resendVerification({
        email: parsed.data.email,
      });
      if (res.rateLimited)
        throw new AuthFlowError(
          "Too many attempts. Please try again later.",
          429,
          60,
        );
    }
    return {
      ok: true,
      message: "If an account exists, a verification link has been sent.",
    };
  }
  if (operation === "signup" || operation === "login") {
    const schema = operation === "signup" ? signupSchema : loginSchema;
    const parsed = schema.safeParse(input);
    if (!parsed.success)
      throw new AuthFlowError(
        operation === "signup"
          ? "Enter a name, a valid email and a password of 10–128 characters."
          : "Enter your email and password.",
      );
    let result: ProviderResult;
    let signupEmail = "";
    if (operation === "signup") {
      const signup = signupSchema.parse(parsed.data);
      signupEmail = signup.email;
      const permit = await deps.reserveSignup(signup.email);
      try {
        await deps.assertInstantSignup();
        result = await deps.provider.signUp({ ...signup, permit });
      } finally {
        await deps.discardPermit(permit);
      }
    } else {
      result = await deps.provider.signIn(parsed.data);
    }
    if (result.rateLimited)
      throw new AuthFlowError(
        "Too many authentication attempts. Please try again later.",
        429,
        60,
      );
    if (result.error) {
      if (operation === "login" && result.unconfirmed) {
        throw new AuthFlowError(
          "Please confirm your email before logging in.",
          403,
        );
      }
      throw new AuthFlowError(
        operation === "login"
          ? "Email or password is incorrect."
          : "Could not create this account. Try logging in or use another email.",
        operation === "login" ? 401 : 400,
      );
    }
    if (!result.hasSession) {
      if (operation === "signup") {
        return {
          pendingVerification: true,
          email: signupEmail,
        };
      }
      throw new AuthFlowError(
        "Automatic sign-in is unavailable. Please try logging in.",
        503,
      );
    }
  }
  // Always verify through the Auth server, never trust a cookie/getSession user.
  const user = await deps.provider.getUser();
  if (!user) throw new AuthFlowError("Please sign in to continue.", 401);
  await deps.bootstrap(user, operation === "signup");
  const next =
    input &&
    typeof input === "object" &&
    "next" in input &&
    typeof input.next === "string"
      ? safeReturnPath(input.next)
      : "/app";
  return {
    redirectTo: next,
  };
}
