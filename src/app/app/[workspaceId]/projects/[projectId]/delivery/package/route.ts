import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/user";
import { requireSameOrigin } from "@/lib/auth/validation";
import { AccessError } from "@/lib/auth/errors";
import { withUserDatabase } from "@/lib/data/context";
import { getDb } from "@/lib/server/db";
import { packageStatus, requestPackage } from "@/lib/data/delivery-packages";
import { packagesEnabled, packageStorage } from "@/features/delivery/storage";
import { maintainPackages, packageKey } from "@/features/delivery/worker";
import {
  capabilityFailure,
  capabilityHeaders,
  readCapabilityJson,
} from "@/features/sharing/http";
export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ workspaceId: string; projectId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const p = await context.params,
      user = await requireUser(),
      query = new URL(request.url).searchParams;
    const job = await withUserDatabase(getDb(), user.id, (tx) =>
      packageStatus(
        tx,
        user.id,
        p.workspaceId,
        p.projectId,
        z.uuid().parse(query.get("completionId")),
      ),
    );
    if (query.get("download") === "1") {
      if (!job || job.status !== "READY")
        throw new AccessError("Package is not ready or has expired.", 410);
      const storage = packageStorage();
      await storage.verify();
      return NextResponse.redirect(await storage.sign(packageKey(job.id)), {
        status: 307,
        headers: capabilityHeaders,
      });
    }
    return NextResponse.json({ job }, { headers: capabilityHeaders });
  } catch (e) {
    return capabilityFailure(e, {
      operation: "package-read",
      stage: "delivery_package",
    });
  }
}
export async function POST(request: Request, context: Context) {
  try {
    if (!requireSameOrigin(request.headers))
      throw new AccessError("Request origin is not allowed.");
    const p = await context.params,
      user = await requireUser();
    const input = z
      .object({
        completionId: z.uuid(),
        operation: z.enum(["request", "cancel"]),
      })
      .parse(await readCapabilityJson(request));
    if (input.operation === "request" && !packagesEnabled())
      throw new AccessError(
        "ZIP generation is not enabled. Download originals individually.",
        409,
      );
    if (input.operation === "request") {
      const limit = await packageStorage().verify();
      const { deliverySnapshot } = await import("@/lib/data/completion");
      const data = await withUserDatabase(getDb(), user.id, (tx) =>
        deliverySnapshot(
          tx,
          user.id,
          p.workspaceId,
          p.projectId,
          input.completionId,
        ),
      );
      const files = data.snapshot?.manifest.files || [];
      if (
        files.reduce((n, f) => n + f.fileSize, 0) + files.length * 1024 + 1024 >
        limit
      )
        throw new AccessError(
          "This package exceeds the configured Storage upload limit. Download originals individually.",
          413,
        );
    }
    const result = await withUserDatabase(getDb(), user.id, (tx) =>
      requestPackage(
        tx,
        user.id,
        p.workspaceId,
        p.projectId,
        input.completionId,
        input.operation === "cancel",
      ),
    );
    after(async () => {
      await maintainPackages(getDb()).catch(() =>
        console.error(
          JSON.stringify({
            event: "package_worker_failure",
            operation: "package",
            reason: "dependency_unavailable",
          }),
        ),
      );
    });
    return NextResponse.json(result, { headers: capabilityHeaders });
  } catch (e) {
    return capabilityFailure(e, {
      operation: "package-request",
      stage: "delivery_package",
    });
  }
}
