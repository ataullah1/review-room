import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { assertPreviewIsolation } from "./lib/config/deployment";

export async function proxy(request: NextRequest) {
  try {
    assertPreviewIsolation();
  } catch {
    return new NextResponse("Preview backend is unavailable.", {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    return new NextResponse("Authentication is unavailable.", {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  const auth = createServerClient(url, key, {
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(values, headers) {
        for (const { name, value } of values) request.cookies.set(name, value);
        const previousCookies = response.cookies.getAll();
        const previousHeaders = ["cache-control", "expires", "pragma"].map(
          (name) => [name, response.headers.get(name)] as const,
        );
        response = NextResponse.next({ request });
        for (const cookie of previousCookies) response.cookies.set(cookie);
        for (const [name, value] of previousHeaders)
          if (value) response.headers.set(name, value);
        for (const [name, value] of Object.entries(headers))
          response.headers.set(name, value);
        for (const { name, value, options } of values)
          response.cookies.set(name, value, options);
      },
    },
  });
  // Verify and refresh, forwarding new cookies to both this render and browser.
  // Real authorization is repeated at each server data access boundary.
  await auth.auth.getClaims();
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Vary", "Cookie");
  return response;
}
export const config = {
  matcher: [
    "/app/:path*",
    "/auth/:path*",
    "/login",
    "/signup",
    "/invite/accept",
    "/invite/decision",
  ],
};
