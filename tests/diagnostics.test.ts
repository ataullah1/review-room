import { describe, expect, it, vi } from "vitest";
import {
  actionFailure,
  classifyFailureReason,
  mutationFailure,
  type MutationFailureContext,
} from "../src/lib/server/diagnostics";
import { AccessError, AuthFlowError } from "../src/lib/auth/errors";
import { UploadError } from "../src/features/uploads/validation";
import { z } from "zod";

describe("shared sanitized diagnostics", () => {
  const context: MutationFailureContext = {
    domain: "projects",
    operation: "create",
    stage: "project_store",
    fallback: "Could not save your changes. Please refresh and try again.",
  };

  it("classifies database configuration, connection, and credential errors without exposing values", () => {
    expect(
      classifyFailureReason(
        new Error(
          "DATABASE_URL must be configured with a valid PostgreSQL URL. See .env.example.",
        ),
      ),
    ).toBe("database_url_configuration");

    expect(
      classifyFailureReason(
        new Error(
          "Configure the Supabase database CA certificate before using the deployed backend.",
        ),
      ),
    ).toBe("database_ca_configuration");

    expect(
      classifyFailureReason(
        new Error(
          "Preview backend requires an isolated Supabase project. Production access is disabled.",
        ),
      ),
    ).toBe("preview_isolation");

    expect(
      classifyFailureReason(
        new Error(
          "Deployed DATABASE_URL does not match the configured Supabase project. Verify database and Auth settings.",
        ),
      ),
    ).toBe("project_consistency");

    // Wrapped adapter errors
    expect(
      classifyFailureReason({
        code: "P2010",
        meta: {
          driverAdapterError: {
            cause: {
              originalCode: "28P01",
              kind: "AuthenticationFailed",
              originalMessage: "sensitive-db-password",
            },
          },
        },
      }),
    ).toBe("database_credentials");

    expect(classifyFailureReason({ code: "42P01" })).toBe("database_schema");
    expect(classifyFailureReason({ code: "42501" })).toBe("database_access");
    expect(classifyFailureReason({ code: "ETIMEDOUT" })).toBe(
      "database_connection",
    );
    expect(classifyFailureReason({ kind: "TlsConnectionError" })).toBe(
      "database_tls",
    );
  });

  it("classifies domain client errors correctly", () => {
    expect(classifyFailureReason(new AccessError("Access denied", 403))).toBe(
      "access_denied",
    );
    expect(
      classifyFailureReason(new UploadError("File is too large", 413)),
    ).toBe("upload_validation");
    expect(
      classifyFailureReason(new AuthFlowError("Invalid password", 401)),
    ).toBe("auth_dependency");

    const schema = z.object({ name: z.string() });
    const parsed = schema.safeParse({});
    if (!parsed.success) {
      expect(classifyFailureReason(parsed.error)).toBe("validation_error");
    }
  });

  it("generates a safe reference and structured log for 5xx mutation failures without leaking data", () => {
    const log = vi.fn();
    const sensitiveError = Object.assign(
      new Error("postgresql://user:secret-password@host/db"),
      {
        code: "28P01",
        query: "SELECT secret_token FROM users WHERE email='private@test.com'",
        meta: { comment: "Secret feedback text" },
      },
    );

    const result = mutationFailure(sensitiveError, context, log);

    expect(result.status).toBe(503);
    expect(result.body.requestId).toBeDefined();
    expect(result.body.requestId).toMatch(/^[a-f0-9-]{36}$/);
    expect(result.body.error).toContain(
      "Could not save your changes. Please refresh and try again.",
    );
    expect(result.body.error).toContain("Reference:");
    expect(result.body.error).toContain(result.body.requestId?.slice(0, 8));

    expect(log).toHaveBeenCalledOnce();
    const logData = JSON.parse(log.mock.calls[0][0]);
    expect(logData).toEqual({
      event: "mutation_failure",
      requestId: result.body.requestId,
      domain: "projects",
      operation: "create",
      stage: "project_store",
      reason: "database_credentials",
    });

    // Verify complete absence of raw sensitive text
    const fullOutput = JSON.stringify({ result, logCalls: log.mock.calls });
    for (const secret of [
      "secret-password",
      "secret_token",
      "private@test.com",
      "Secret feedback text",
      "postgresql://",
    ]) {
      expect(fullOutput).not.toContain(secret);
    }
  });

  it("returns clean user errors for client 4xx without server-error logs or reference noise", () => {
    const log = vi.fn();

    // 403 AccessError
    const accessFailure = mutationFailure(
      new AccessError("You do not have permission to view this project.", 403),
      context,
      log,
    );
    expect(accessFailure.status).toBe(403);
    expect(accessFailure.body.error).toBe(
      "You do not have permission to view this project.",
    );
    expect(accessFailure.body.error).not.toContain("Reference:");
    expect(log).not.toHaveBeenCalled();

    // 400 ZodError
    const schema = z.object({ title: z.string().min(1, "Title is required") });
    const parsed = schema.safeParse({ title: "" });
    if (!parsed.success) {
      const zodFailure = mutationFailure(parsed.error, context, log);
      expect(zodFailure.status).toBe(400);
      expect(zodFailure.body.error).toBe("Title is required");
      expect(zodFailure.body.error).not.toContain("Reference:");
      expect(log).not.toHaveBeenCalled();
    }
  });

  it("formats Server Action failures with reference for 5xx and without reference for 4xx", () => {
    const log = vi.fn();

    // Server action 5xx
    const actionResult = actionFailure(
      new Error("database unreachable"),
      context,
      log,
    );
    expect(actionResult.error).toContain(
      "Could not save your changes. Please refresh and try again.",
    );
    expect(actionResult.error).toContain("Reference:");
    expect(actionResult.requestId).toBeDefined();
    expect(log).toHaveBeenCalledOnce();

    // Server action 403
    const log2 = vi.fn();
    const deniedAction = actionFailure(
      new AccessError("Unauthorized action", 403),
      context,
      log2,
    );
    expect(deniedAction.error).toBe("Unauthorized action");
    expect(deniedAction.requestId).toBeUndefined();
    expect(log2).not.toHaveBeenCalled();
  });
});
