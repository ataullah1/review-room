import { randomUUID } from "node:crypto";
import { AccessError, AuthFlowError } from "../auth/errors";
import { UploadError } from "../../features/uploads/validation";
import { ZodError } from "zod";

export type DiagnosticDomain =
  | "auth"
  | "projects"
  | "uploads"
  | "comments"
  | "reviews"
  | "sharing"
  | "maintenance";

export type MutationFailureContext = {
  domain: DiagnosticDomain;
  operation: string;
  stage: string;
  fallback: string;
};

const reasons: Record<string, string> = {
  database_url_missing: "database_url_missing",
  database_url_empty: "database_url_empty",
  database_url_assignment: "database_url_assignment",
  database_url_quoted: "database_url_quoted",
  database_url_protocol: "database_url_protocol",
  database_url_invalid: "database_url_invalid",
  app_url_missing: "app_url_missing",
  app_url_invalid: "app_url_invalid",
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
  // Storage specific error codes
  StorageApiError: "storage_failure",
  StorageBucketNotFound: "storage_configuration",
  StorageObjectNotFound: "storage_object_missing",
  PayloadTooLargeError: "storage_payload_limit",
};

export function classifyFailureReason(error: unknown): string {
  if (error instanceof Error) {
    if (
      error.message.startsWith("Configure the Supabase database CA certificate")
    )
      return "database_ca_configuration";
    if (error.message.startsWith("DATABASE_URL must be configured")) {
      const code = (error as Error & { code?: string }).code;
      return code && Object.hasOwn(reasons, code)
        ? reasons[code]
        : "database_url_configuration";
    }
    if (error.message.startsWith("NEXT_PUBLIC_APP_URL must be configured"))
      return "app_url_configuration";
    if (error.message === "Supabase Auth configuration is missing.")
      return "auth_configuration";
    if (error.message.startsWith("Supabase storage is not configured"))
      return "storage_configuration";
    if (
      error.message.startsWith(
        "Preview backend requires an isolated Supabase project",
      )
    )
      return "preview_isolation";
    if (
      error.message.startsWith(
        "Hosted acceptance requires a separate non-production Supabase project",
      )
    )
      return "hosted_test_isolation";
    if (error.message.startsWith("Deployed DATABASE_URL does not match"))
      return "project_consistency";
    if (error.message.startsWith("Deployed DIRECT_URL does not match"))
      return "project_consistency";
  }

  // Prisma and Supabase wrap underlying adapter/network errors.
  // Inspect only fixed code/kind fields; never log raw messages, queries, URLs, passwords or tokens.
  const queue: unknown[] = [error];
  const seen = new Set<unknown>();
  for (let index = 0; index < queue.length && index < 16; index++) {
    const value = queue[index];
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    const entry = value as Record<string, unknown>;
    for (const field of ["code", "originalCode", "kind", "name"]) {
      const code = entry[field];
      if (typeof code === "string" && Object.hasOwn(reasons, code))
        return reasons[code];
    }
    for (const field of [
      "cause",
      "meta",
      "driverAdapterError",
      "originalError",
      "error",
    ])
      queue.push(entry[field]);
  }

  if (error instanceof AuthFlowError) return "auth_dependency";
  if (error instanceof UploadError) return "upload_validation";
  if (error instanceof AccessError) return "access_denied";
  if (error instanceof ZodError) return "validation_error";
  return "unclassified";
}

export function isClientFailure(error: unknown): boolean {
  if (error instanceof ZodError) return true;
  if (error instanceof AccessError) return true;
  if (error instanceof UploadError && error.status < 500) return true;
  if (error instanceof AuthFlowError && error.status < 500) return true;
  return false;
}

export function clientFailureInfo(error: unknown, fallbackMessage?: string) {
  if (error instanceof ZodError) {
    return {
      status: 400,
      message:
        error.issues[0]?.message || fallbackMessage || "Invalid request.",
    };
  }
  if (error instanceof AccessError) {
    return {
      status: error.status,
      message: error.message,
      retryAfter: error.status === 429 ? 600 : undefined,
    };
  }
  if (error instanceof UploadError) {
    return {
      status: error.status,
      message: error.message,
    };
  }
  if (error instanceof AuthFlowError) {
    return {
      status: error.status,
      message: error.message,
      retryAfter: error.retryAfter,
    };
  }
  return null;
}

export function mutationFailure(
  error: unknown,
  context: MutationFailureContext,
  log: (line: string) => void = console.error,
) {
  const clientInfo = clientFailureInfo(error, context.fallback);
  if (clientInfo && clientInfo.status < 500) {
    return {
      status: clientInfo.status,
      body: { error: clientInfo.message },
      retryAfter: clientInfo.retryAfter,
    };
  }

  const requestId = randomUUID();
  const reason = classifyFailureReason(error);

  log(
    JSON.stringify({
      event: "mutation_failure",
      requestId,
      domain: context.domain,
      operation: context.operation,
      stage: context.stage,
      reason,
    }),
  );

  return {
    status: clientInfo?.status ?? 503,
    body: {
      error: `${context.fallback} (Reference: ${requestId.slice(0, 8)})`,
      requestId,
    },
    retryAfter: clientInfo?.retryAfter,
  };
}

export function actionFailure(
  error: unknown,
  context: MutationFailureContext,
  log: (line: string) => void = console.error,
): { error: string; requestId?: string } {
  const clientInfo = clientFailureInfo(error, context.fallback);
  if (clientInfo && clientInfo.status < 500) {
    return { error: clientInfo.message };
  }

  const requestId = randomUUID();
  const reason = classifyFailureReason(error);

  log(
    JSON.stringify({
      event: "mutation_failure",
      requestId,
      domain: context.domain,
      operation: context.operation,
      stage: context.stage,
      reason,
    }),
  );

  return {
    error: `${context.fallback} (Reference: ${requestId.slice(0, 8)})`,
    requestId,
  };
}
