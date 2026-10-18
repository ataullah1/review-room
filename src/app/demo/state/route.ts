import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireSameOrigin } from "@/lib/auth/validation";
import { AccessError } from "@/lib/auth/errors";
import { getDb } from "@/lib/server/db";
import { readDemo, mutateDemo, withDemoDatabase } from "@/lib/data/demo";
import { demoCookie, readDemoCookie } from "@/features/demo/cookie";
import { demoHeaders, demoFailure, demoJson } from "@/features/demo/http";
export const runtime = "nodejs";
async function identity() {
  const value = readDemoCookie((await cookies()).get(demoCookie)?.value);
  if (!value)
    throw new AccessError(
      "Your demo session expired. Start a fresh demo.",
      410,
    );
  return value;
}
export async function GET(request: Request) {
  try {
    if (new URL(request.url).search)
      throw new AccessError("Demo requests cannot select a workspace.", 400);
    const guest = await identity();
    return NextResponse.json(
      await withDemoDatabase(getDb(), guest, (tx) => readDemo(tx, guest)),
      { headers: demoHeaders },
    );
  } catch (error) {
    return demoFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    if (new URL(request.url).search)
      throw new AccessError("Demo requests cannot select a workspace.", 400);
    if (!requireSameOrigin(request.headers))
      throw new AccessError("Request origin is not allowed.");
    const guest = await identity(),
      input = await demoJson(request);
    return NextResponse.json(
      await withDemoDatabase(getDb(), guest, (tx) =>
        mutateDemo(tx, guest, input),
      ),
      { headers: demoHeaders },
    );
  } catch (error) {
    return demoFailure(error);
  }
}
