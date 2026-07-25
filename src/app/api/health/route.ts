import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  const checks: Record<string, "ok" | "fail"> = {};

  try {
    const { error } = await createAdminClient()
      .from("site_settings")
      .select("key", { head: true, count: "exact" })
      .limit(1);
    checks.database = error ? "fail" : "ok";
  } catch {
    checks.database = "fail";
  }

  const healthy = Object.values(checks).every((value) => value === "ok");

  return NextResponse.json(
    {
      status: healthy ? "healthy" : "degraded",
      checks,
      latencyMs: Date.now() - started,
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
