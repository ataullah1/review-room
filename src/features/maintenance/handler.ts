import { timingSafeEqual, randomUUID } from "node:crypto";
export const maintenanceHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  Vary: "Authorization",
};
export function cronAuthorized(
  headers: Pick<Headers, "get">,
  secret = process.env.CRON_SECRET,
) {
  if (!secret || secret.length < 32) return false;
  const expected = Buffer.from(`Bearer ${secret}`),
    received = Buffer.from(headers.get("authorization") || "");
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}
// Dependencies are lazy: an unauthorized request cannot create a DB/Storage client.
export async function maintenanceResponse(
  request: Request,
  dependencies: {
    secret?: string;
    cleanup(): Promise<{
      demo: { removed: number };
      uploads: { examined: number; cleaned: number };
    }>;
    log(event: { requestId: string; operation: string; status: string }): void;
  },
) {
  if (!cronAuthorized(request.headers, dependencies.secret))
    return Response.json(
      { error: "Unauthorized." },
      { status: 401, headers: maintenanceHeaders },
    );
  const requestId = randomUUID();
  try {
    const result = await dependencies.cleanup();
    const partial = result.uploads.cleaned < result.uploads.examined;
    dependencies.log({
      requestId,
      operation: "maintenance.cleanup",
      status: partial ? "partial" : "complete",
    });
    if (partial)
      return Response.json(
        {
          requestId,
          ...result,
          error: "Some uploads remain queued. Retry the bounded batch.",
        },
        { status: 503, headers: maintenanceHeaders },
      );
    return Response.json(
      { requestId, ...result },
      { headers: maintenanceHeaders },
    );
  } catch {
    dependencies.log({
      requestId,
      operation: "maintenance.cleanup",
      status: "failed",
    });
    return Response.json(
      {
        requestId,
        error: "Cleanup did not complete. Retry the bounded batch.",
      },
      { status: 503, headers: maintenanceHeaders },
    );
  }
}
