import { describe, expect, it, vi } from "vitest";
import { authFailure, authFailureReason } from "../src/lib/auth/failure";
import { AuthFlowError } from "../src/lib/auth/errors";

const context = {
  operation: "google" as const,
  stage: "quota_database" as const,
  fallback: "Could not start Google sign-in. Please try again.",
};

describe("safe authentication diagnostics", () => {
  it("identifies a missing/malformed database CA without logging its value", () => {
    expect(
      authFailureReason(
        new Error(
          "Configure the Supabase database CA certificate before using the deployed backend.",
        ),
      ),
    ).toBe("database_ca_configuration");
    expect(
      authFailureReason(
        new Error(
          "DATABASE_URL must be configured with a valid PostgreSQL URL. See .env.example.",
        ),
      ),
    ).toBe("database_url_configuration");
  });

  it("finds PostgreSQL credential errors wrapped by the Prisma adapter", () => {
    expect(
      authFailureReason({
        code: "P2010",
        meta: {
          driverAdapterError: {
            cause: {
              originalCode: "28P01",
              kind: "AuthenticationFailed",
              originalMessage: "secret database password",
            },
          },
        },
      }),
    ).toBe("database_credentials");
    expect(
      authFailureReason({
        cause: { kind: "TlsConnectionError", reason: "certificate payload" },
      }),
    ).toBe("database_tls");
    expect(authFailureReason({ code: "42P01" })).toBe("database_schema");
    expect(authFailureReason({ code: "42501" })).toBe("database_access");
    expect(authFailureReason({ code: "ETIMEDOUT" })).toBe(
      "database_connection",
    );
  });

  it("correlates unknown failures while excluding messages, SQL, credentials and identity", () => {
    const log = vi.fn();
    const error = Object.assign(
      new Error("postgresql://user:private-password@host/db"),
      {
        code: "28P01",
        query: "SELECT private-token",
        meta: { email: "private@example.test", cookie: "private-cookie" },
      },
    );
    const response = authFailure(error, context, log);
    expect(response.status).toBe(503);
    expect(response.body.requestId).toMatch(/^[a-f0-9-]{36}$/);
    expect(response.body.error).toContain("Reference:");
    expect(JSON.parse(log.mock.calls[0][0])).toEqual({
      event: "auth_failure",
      requestId: response.body.requestId,
      operation: "google",
      stage: "quota_database",
      reason: "database_credentials",
    });
    const output = JSON.stringify({ response, logs: log.mock.calls });
    for (const secret of [
      "private-password",
      "private-token",
      "private@example.test",
      "private-cookie",
      "postgresql://",
    ])
      expect(output).not.toContain(secret);
  });

  it("preserves client errors and rate-limit headers without server-error logs", () => {
    const log = vi.fn();
    const denied = authFailure(
      new AuthFlowError("Email or password is incorrect.", 401),
      { ...context, operation: "login", stage: "password_provider" },
      log,
    );
    expect(denied).toEqual({
      status: 401,
      body: { error: "Email or password is incorrect." },
      retryAfter: undefined,
    });
    const limited = authFailure(
      new AuthFlowError("Try again later.", 429, 60),
      context,
      log,
    );
    expect(limited.status).toBe(429);
    expect(limited.retryAfter).toBe(60);
    expect(log).not.toHaveBeenCalled();
  });

  it("never treats arbitrary codes or cyclic metadata as loggable payloads", () => {
    const error: Record<string, unknown> = {
      code: "private-password",
      message: "private-token",
    };
    error.cause = error;
    expect(authFailureReason(error)).toBe("unclassified");
    expect(authFailureReason({ code: "__proto__" })).toBe("unclassified");
    const log = vi.fn();
    authFailure(error, context, log);
    expect(log.mock.calls[0][0]).not.toContain("private-");
  });

  it("adds a reference to known provider outages and keeps their status", () => {
    const log = vi.fn();
    const response = authFailure(
      new AuthFlowError("Provider unavailable.", 503),
      context,
      log,
    );
    expect(response.status).toBe(503);
    expect(response.body.error).toContain("Provider unavailable.");
    expect(JSON.parse(log.mock.calls[0][0]).reason).toBe("auth_dependency");
  });
});
