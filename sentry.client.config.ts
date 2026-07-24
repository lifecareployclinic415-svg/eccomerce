import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? "development",
  enabled: process.env.NODE_ENV === "production",
  tracesSampleRate: 0.1,
  // Session replay masks all text and blocks media by default: a replay
  // of a checkout would otherwise capture addresses and card fields.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0.1,
});
