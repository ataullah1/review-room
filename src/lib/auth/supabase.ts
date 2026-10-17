import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export function authConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase Auth configuration is missing.");
  return { url, key };
}
export async function createAuthClient(writable = false) {
  const jar = await cookies();
  const { url, key } = authConfiguration();
  return createServerClient(url, key, {
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
    cookies: {
      getAll() {
        return jar.getAll();
      },
      setAll(values) {
        if (writable) {
          for (const { name, value, options } of values)
            jar.set(name, value, options);
        } else {
          // Server Components cannot write cookies; proxy refreshes them first.
          try {
            for (const { name, value, options } of values)
              jar.set(name, value, options);
          } catch {}
        }
      },
    },
  });
}
