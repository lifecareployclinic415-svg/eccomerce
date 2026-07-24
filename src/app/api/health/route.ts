// src/app/api/health/route.ts

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  const checks: Record<string, "ok" | "fail"> = {};

  try {
    // Cheapest possible round trip that proves Postgres is reachable
    // AND that our credentials still work.
    const { error } = await createAdminClient()
      .from("site_settings")
      .select("key", { head: true, count: "exact" })
      .limit(1);

    checks.database = error ? "fail" : "ok";
  } catch {
    checks.database = "fail";
  }

  const healthy = Object.values(checks).every((v) => v === "ok");

  return NextResponse.json(
    {
      status: healthy ? "healthy" : "degraded",
      checks,
      latencyMs: Date.now() - started,
      // Lets you confirm which build is actually serving traffic —
      // surprisingly often the answer is "not the one you just shipped".
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      timestamp: new Date().toISOString(),
    },
    {
      // A non-200 is what makes an uptime monitor page you.
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

// =====================================================================
// instrumentation.ts  (project root, beside next.config.ts)
//
//   npm install @sentry/nextjs
//   npx @sentry/wizard@latest -i nextjs
//
// The wizard writes most of this. Verify the generated files against
// current Sentry docs — their Next.js integration changes often enough
// that copied snippets go stale quickly.
// =====================================================================
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = async (...args: unknown[]) => {
  const Sentry = await import("@sentry/nextjs");
  // @ts-expect-error — signature varies by Sentry version
  return Sentry.captureRequestError(...args);
};
