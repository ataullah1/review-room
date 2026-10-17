import "server-only";
import { createAuthClient } from "./supabase";
import { AccessError } from "./errors";
import type { User } from "@supabase/supabase-js";

export function identityFromUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    displayName: [
      user.user_metadata?.display_name,
      user.user_metadata?.full_name,
      user.user_metadata?.name,
    ]
      .find(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      )
      ?.slice(0, 80),
  };
}
export async function requireUser() {
  const auth = await createAuthClient();
  const { data, error } = await auth.auth.getUser();
  if (error || !data.user) throw new AccessError("Please sign in.", 401);
  return identityFromUser(data.user);
}
