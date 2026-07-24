import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * CSRF.
 *
 * Next.js already compares Origin against Host for Server Actions, which
 * covers the classic cross-site POST. These add defence in depth for two
 * reasons: the framework's check can be weakened by proxy misconfiguration,
 * and Sec-Fetch-Site catches cases Origin alone does not.
 *
 * Route Handlers (our webhooks) get NO automatic protection at all — they
 * rely on provider signatures instead, which is why Phase 10 verifies HMAC.
 */
export async function assertSameOrigin(): Promise<void> {
  const head = await headers();

  // Sent by all modern browsers, cannot be forged by page JavaScript.
  const fetchSite = head.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    throw new SecurityError("Cross-origin request rejected");
  }

  const origin = head.get("origin");
  const host = head.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        throw new SecurityError("Origin mismatch");
      }
    } catch {
      throw new SecurityError("Malformed origin");
    }
  }
}

export class SecurityError extends Error {}

/** Records auth/authorization events for investigation. Never throws. */
export async function logSecurityEvent(params: {
  event: string;
  severity?: "info" | "warning" | "critical";
  userId?: string | null;
  detail?: Record<string, unknown>;
}) {
  try {
    const head = await headers();
    const ip = head.get("x-forwarded-for")?.split(",")[0]?.trim();

    await createAdminClient().from("security_events").insert({
      user_id: params.userId ?? null,
      event: params.event,
      severity: params.severity ?? "info",
      ip_prefix: ip ? ip.split(".").slice(0, 3).join(".") + ".0/24" : null,
      user_agent: head.get("user-agent")?.slice(0, 300) ?? null,
      detail: params.detail ?? null,
    });
  } catch (e) {
    console.error("[security] event log failed", e);
  }
}
