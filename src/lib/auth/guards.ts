import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Defence in depth. Middleware gives a fast redirect for unauthenticated
 * visitors, but middleware alone is NOT an authorization boundary — these
 * guards run in the Server Component / Server Action itself, next to the data.
 *
 * react `cache` dedupes the call within a single render pass, so calling
 * getCurrentUser() in a layout and a page costs one network round trip.
 */

export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  // getUser() revalidates the JWT with the Auth server.
  // Never use getSession() for authorization — it only reads the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export async function requireUser(redirectTo = "/account") {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?redirect=${encodeURIComponent(redirectTo)}`);
  return user;
}

export const getUserRoles = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", userId);

  return (data ?? []).flatMap((r) => (r.roles ? [r.roles.name] : []));
});

export async function requireAdmin() {
  const user = await requireUser("/admin");
  const roles = await getUserRoles(user.id);

  if (!roles.some((r) => r === "admin" || r === "super_admin")) {
    // 404 rather than 403: don't confirm the admin area exists.
    redirect("/not-found");
  }
  return user;
}
