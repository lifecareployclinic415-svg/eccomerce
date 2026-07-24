// Place at: src/app/auth/callback/route.ts
//
// OAuth (Google) redirects back here with a PKCE authorization code.
// We exchange it server-side for a session written to httpOnly cookies —
// the token never touches client-side JavaScript.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/account";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/account";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Behind a proxy (Vercel), trust the forwarded host for the redirect.
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocal = process.env.NODE_ENV === "development";

      if (isLocal) return NextResponse.redirect(`${origin}${safeNext}`);
      if (forwardedHost) return NextResponse.redirect(`https://${forwardedHost}${safeNext}`);
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/error?reason=oauth_failed`);
}
