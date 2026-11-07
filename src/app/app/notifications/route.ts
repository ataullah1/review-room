import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/user";
import { requireSameOrigin } from "@/lib/auth/validation";
import { getDb } from "@/lib/server/db";
import { withUserDatabase } from "@/lib/data/context";
import { AccessError } from "@/lib/auth/errors";
import {
  capabilityFailure,
  capabilityHeaders,
  readCapabilityJson,
} from "@/features/sharing/http";
export async function GET() {
  try {
    const user = await requireUser();
    const pref = await withUserDatabase(getDb(), user.id, (tx) =>
      tx.notificationPreference.findUnique({ where: { userId: user.id } }),
    );
    return NextResponse.json(
      { emailEnabled: pref?.emailEnabled ?? true },
      { headers: capabilityHeaders },
    );
  } catch (e) {
    return capabilityFailure(e);
  }
}
export async function POST(request: Request) {
  try {
    if (!requireSameOrigin(request.headers))
      throw new AccessError("Request origin is not allowed.");
    const user = await requireUser(),
      data = z
        .object({ emailEnabled: z.boolean() })
        .parse(await readCapabilityJson(request));
    await withUserDatabase(getDb(), user.id, (tx) =>
      tx.notificationPreference.upsert({
        where: { userId: user.id },
        create: { userId: user.id, ...data },
        update: data,
      }),
    );
    return NextResponse.json({ ok: true }, { headers: capabilityHeaders });
  } catch (e) {
    return capabilityFailure(e);
  }
}
