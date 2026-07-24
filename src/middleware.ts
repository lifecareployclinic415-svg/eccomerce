// src/middleware.ts — replaces the Phase 3 version.

import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * CSP STRATEGY — a deliberate split, not an oversight.
 *
 * Nonce-based CSP requires DYNAMIC RENDERING on every page, because a
 * fresh nonce must be generated per request. Applying it site-wide would
 * disable the static generation and ISR that Phase 7 and Phase 13 were
 * built around, making the storefront slower and more expensive to serve.
 *
 * So:
 *   /admin, /account, /checkout  → nonce + 'strict-dynamic'. These are
 *       already dynamic and personalised, they handle the most sensitive
 *       data, and they are where an XSS payload would do real damage.
 *
 *   storefront                   → static policy without a nonce, so
 *       product and category pages stay statically renderable.
 *
 * If you later want strict CSP everywhere while keeping static output,
 * Next.js has experimental hash-based CSP via Subresource Integrity —
 * worth revisiting once it stabilises.
 */

const STRICT_CSP_PREFIXES = ["/admin", "/account", "/checkout"];

const SUPABASE_HOST = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

function buildCsp(nonce: string | null): string {
  const isDev = process.env.NODE_ENV === "development";

  const directives = [
    `default-src 'self'`,

    // 'strict-dynamic' means scripts loaded BY a nonced script are trusted
    // too, so Next's hydration and lazy chunks work without listing every
    // URL. 'unsafe-eval' is required in development because React uses
    // eval to rebuild server error stacks in the browser.
    nonce
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https: ${isDev ? "'unsafe-eval'" : ""}`
      : `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ""} https://www.googletagmanager.com https://www.google-analytics.com https://connect.facebook.net https://www.clarity.ms https://checkout.razorpay.com https://js.stripe.com`,

    // Tailwind and Radix inject inline styles at runtime; a style nonce
    // breaks them, and style injection is a far lower-severity vector
    // than script injection.
    `style-src 'self' 'unsafe-inline'`,

    `img-src 'self' blob: data: https:`,
    `font-src 'self' data:`,
    `connect-src 'self' ${SUPABASE_HOST} wss://${SUPABASE_HOST.replace("https://", "")} https://www.google-analytics.com https://api.razorpay.com https://api.stripe.com`,
    // Payment providers render their checkout inside an iframe.
    `frame-src https://api.razorpay.com https://js.stripe.com https://checkout.razorpay.com`,

    // The three cheapest, highest-value directives there are.
    `object-src 'none'`,        // kills legacy plugin-based XSS
    `base-uri 'self'`,          // stops <base> hijacking of relative URLs
    `form-action 'self'`,       // stops forms being repointed at an attacker

    `frame-ancestors 'none'`,   // clickjacking
    `upgrade-insecure-requests`,
  ];

  return directives.filter(Boolean).join("; ").replace(/\s{2,}/g, " ").trim();
}

/** Headers applied to every response. */
function applySecurityHeaders(response: NextResponse, csp: string) {
  response.headers.set("Content-Security-Policy", csp);

  // Two years, subdomains included. Only enable once you are certain
  // every subdomain can serve HTTPS — this is hard to walk back.
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  // Send the full URL internally, origin-only cross-site: keeps referrer
  // analytics working without leaking order ids to third parties.
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(self)",
  );
  response.headers.set("X-DNS-Prefetch-Control", "on");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");

  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const useNonce = STRICT_CSP_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const nonce = useNonce ? Buffer.from(crypto.randomUUID()).toString("base64") : null;
  const csp = buildCsp(nonce);

  if (nonce) {
    // Next reads the nonce from the request header and attaches it to its
    // own script tags automatically.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);

    const sessionResponse = await updateSession(request, requestHeaders);
    return applySecurityHeaders(sessionResponse, csp);
  }

  const sessionResponse = await updateSession(request);
  return applySecurityHeaders(sessionResponse, csp);
}

export const config = {
  matcher: [
    /*
     * Everything except:
     *   api/webhooks — payment providers are not authenticated users.
     *                  Without this exclusion middleware redirects them
     *                  to /login and webhooks silently never fire.
     *   _next/static, _next/image, favicon, images — no auth needed and
     *                  running middleware on assets wastes invocations.
     */
    "/((?!api/webhooks|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
