// Place at: src/app/auth/confirm/route.ts
//
// Handles BOTH email verification (type=email) and password recovery
// (type=recovery). Supabase email templates must link here using
// {{ .TokenHash }} — see the template snippets in the phase notes.

import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  // Reject absolute URLs to prevent open redirects.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (token_hash && type) {
    const supabase = await createClient();

    // Exchanges the one-time token for a session cookie.
    // The token is single-use and short-lived, enforced by Supabase.
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });

    if (!error) redirect(safeNext);
  }

  redirect("/auth/error?reason=invalid_link");
}
