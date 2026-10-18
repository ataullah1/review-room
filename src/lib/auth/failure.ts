import { randomUUID } from "node:crypto";
import { AuthFlowError } from "./errors";
import type { AuthOperation } from "./core";

export type AuthStage =
  | "configuration"
  | "request_body"
  | "provider_settings"
  | "password_provider"
  | "signup_provider"
  | "identity_provider"
  | "logout_provider"
  | "quota_database"
  | "workspace_database"
  | "oauth_provider"
  | "oauth_token"
  | "permit_cleanup"
  | "session_cookies";

type FailureContext = {
  operation: AuthOperation | "google" | "callback";
  stage: AuthStage;
  fallback: string;
};

const reasons: Record<string, string> = {
  "28P01": "database_credentials",
  P1000: "database_credentials",
  AuthenticationFailed: "database_credentials",
  "28000": "database_access",
  "42501": "database_access",
  P1010: "database_access",
  DatabaseAccessDenied: "database_access",
  "42P01": "database_schema",
  "42703": "database_schema",
  P2021: "database_schema",
  P2022: "database_schema",
  TableDoesNotExist: "database_schema",
  ColumnNotFound: "database_schema",
  "53300": "database_capacity",
  TooManyConnections: "database_capacity",
  ENOTFOUND: "database_connection",
  ECONNREFUSED: "database_connection",
  ECONNRESET: "database_connection",
  ETIMEDOUT: "database_connection",
  P1001: "database_connection",
  P1002: "database_connection",
  P2024: "database_connection",
  DatabaseNotReachable: "database_connection",
  SocketTimeout: "database_connection",
  TlsConnectionError: "database_tls",
  SELF_SIGNED_CERT_IN_CHAIN: "database_tls",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "database_tls",
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: "database_tls",
  CERT_HAS_EXPIRED: "database_tls",
  ERR_TLS_CERT_ALTNAME_INVALID: "database_tls",
  ERR_OSSL_PEM_NO_START_LINE: "database_tls",
};

export function authFailureReason(error: unknown): string {
  if (error instanceof Error) {
    if (
      error.message.startsWith("Configure the Supabase database CA certificate")
    )
      return "database_ca_configuration";
    if (error.message.startsWith("DATABASE_URL must be configured"))
      return "database_url_configuration";
    if (error.message === "Supabase Auth configuration is missing.")
      return "auth_configuration";
    if (
      error.message.startsWith(
        "Preview backend requires an isolated Supabase project",
      )
    )
      return "preview_isolation";
  }
  // Prisma wraps adapter errors. Inspect only fixed code/kind fields; never log
  // its message, query, metadata payload, URL, user identity or nested error.
  const queue: unknown[] = [error];
  const seen = new Set<unknown>();
  for (let index = 0; index < queue.length && index < 16; index++) {
    const value = queue[index];
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    const entry = value as Record<string, unknown>;
    for (const field of ["code", "originalCode", "kind"]) {
      const code = entry[field];
      if (typeof code === "string" && Object.hasOwn(reasons, code))
        return reasons[code];
    }
    for (const field of [
      "cause",
      "meta",
      "driverAdapterError",
      "originalError",
    ])
      queue.push(entry[field]);
  }
  return error instanceof AuthFlowError ? "auth_dependency" : "unclassified";
}

export function authFailure(
  error: unknown,
  context: FailureContext,
  log: (line: string) => void = console.error,
) {
  const known = error instanceof AuthFlowError;
  const status = known ? error.status : 503;
  const message = known ? error.message : context.fallback;
  const retryAfter = known ? error.retryAfter : undefined;
  if (status < 500) return { status, body: { error: message }, retryAfter };

  const requestId = randomUUID();
  log(
    JSON.stringify({
      event: "auth_failure",
      requestId,
      operation: context.operation,
      stage: context.stage,
      reason: authFailureReason(error),
    }),
  );
  return {
    status,
    body: {
      error: `${message} (Reference: ${requestId.slice(0, 8)})`,
      requestId,
    },
    retryAfter,
  };
}
