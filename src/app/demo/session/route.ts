import { z } from "zod";
import { createHash } from "node:crypto";
import { after, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireSameOrigin } from "@/lib/auth/validation";
import { AccessError } from "@/lib/auth/errors";
import { getDb } from "@/lib/server/db";
import { createDemo, readDemo, withDemoDatabase } from "@/lib/data/demo";
import {
  demoCookie,
  newDemoIdentity,
  readDemoCookie,
  signDemoCookie,
} from "@/features/demo/cookie";
import { cleanupDemoSessions } from "@/features/demo/cleanup";
import { limitCapability } from "@/features/sharing/rate-limit";
import { demoFailure, demoHeaders, demoJson } from "@/features/demo/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (!requireSameOrigin(request.headers))
      throw new AccessError("Request origin is not allowed.");
    if (new URL(request.url).search)
      throw new AccessError("Demo requests cannot select a workspace.", 400);
    if (request.body)
      z.object({})
        .strict()
        .parse(await demoJson(request));
    const db = getDb(),
      jar = await cookies(),
      existing = readDemoCookie(jar.get(demoCookie)?.value);
    if (existing) {
      try {
        return NextResponse.json(
          await withDemoDatabase(db, existing, (tx) => readDemo(tx, existing)),
          { headers: demoHeaders },
        );
      } catch (error) {
        if (!(error instanceof AccessError && error.status === 410))
          throw error;
      }
    }
    await limitCapability(db, request.headers, "demo-start");
    const { id, token } = newDemoIdentity(),
      identity = {
        id,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expires: Date.now() + 86400000,
      };
    const snapshot = await withDemoDatabase(db, identity, (tx) =>
      createDemo(tx, identity),
    );
    jar.set(
      demoCookie,
      signDemoCookie(id, token, new Date(snapshot.expiresAt).getTime()),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/demo",
        maxAge: 86400,
      },
    );
    after(async () => {
      await cleanupDemoSessions(db, 10).catch(() => undefined);
    });
    return NextResponse.json(snapshot, { headers: demoHeaders });
  } catch (error) {
    return demoFailure(error);
  }
}
