// sentry.server.config.ts

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? "development",
  release: process.env.VERCEL_GIT_COMMIT_SHA,

  // 100% sampling on a busy store is expensive and rarely more useful
  // than 10%. Errors are always captured regardless of this rate.
  tracesSampleRate: process.env.VERCEL_ENV === "production" ? 0.1 : 1.0,

  // Local noise drowns real signal.
  enabled: process.env.NODE_ENV === "production",

  /**
   * SCRUBBING IS NOT OPTIONAL.
   *
   * An error report from a checkout handler can carry addresses, emails
   * and payment payloads. Sending those to a third-party error tracker
   * turns a crash into a data-protection incident, and under DPDP that
   * is a materially worse problem than the bug you were debugging.
   */
  beforeSend(event) {
    if (event.request?.cookies) delete event.request.cookies;
    if (event.request?.headers) {
      delete event.request.headers.cookie;
      delete event.request.headers.authorization;
      delete event.request.headers["x-razorpay-signature"];
      delete event.request.headers["stripe-signature"];
    }

    // Strip query strings entirely — they carry emails, tokens and
    // order ids often enough that allowlisting is not worth the risk.
    if (event.request?.query_string) delete event.request.query_string;

    return scrub(event) as typeof event;
  },

  ignoreErrors: [
    // Next's redirect() and notFound() throw by design.
    "NEXT_REDIRECT",
    "NEXT_NOT_FOUND",
    // Browser extension noise, not your code.
    "ResizeObserver loop limit exceeded",
  ],
});

const SENSITIVE = /(^|_)(password|secret|token|key|authorization|email|phone|otp|card|cvv)($|_)/i;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) =>
      SENSITIVE.test(k) ? [k, "[redacted]"] : [k, scrub(v, depth + 1)],
    ),
  );
}
