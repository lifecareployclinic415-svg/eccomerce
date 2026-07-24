// src/features/analytics/actions/consent.actions.ts

"use server";

import { z } from "zod";
import { cookies, headers } from "next/headers";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/guards";
import {
  CONSENT_COOKIE,
  VISITOR_COOKIE,
  POLICY_VERSION,
} from "@/features/analytics/lib/consent";

const consentSchema = z.object({
  analytics: z.boolean(),
  marketing: z.boolean(),
  personalization: z.boolean(),
  action: z.enum(["accept_all", "reject_all", "custom", "withdraw"]),
});

export async function recordConsentAction(input: unknown) {
  const parsed = consentSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const };

  const store = await cookies();
  const head = await headers();

  // A stable pseudonymous id so a visitor's consent history is traceable
  // without requiring an account. NOT httpOnly — the banner reads it.
  let visitorId = store.get(VISITOR_COOKIE)?.value;
  if (!visitorId) {
    visitorId = randomUUID();
    store.set(VISITOR_COOKIE, visitorId, {
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      path: "/",
    });
  }

  const { action, ...state } = parsed.data;

  store.set(CONSENT_COOKIE, encodeURIComponent(JSON.stringify(state)), {
    // Readable by the banner script, so not httpOnly. It carries a
    // preference, not a credential.
    maxAge: 60 * 60 * 24 * 180,
    sameSite: "lax",
    path: "/",
  });

  const user = await getCurrentUser();

  try {
    await createAdminClient().from("consent_log").insert({
      user_id: user?.id ?? null,
      visitor_id: visitorId,
      analytics: state.analytics,
      marketing: state.marketing,
      personalization: state.personalization,
      policy_version: POLICY_VERSION,
      action,
      // Truncated to /24: enough to resolve a dispute, not a precise
      // identifier retained indefinitely. Data minimisation applies to
      // the compliance record too.
      ip_prefix: truncateIp(head.get("x-forwarded-for")?.split(",")[0]?.trim()),
      user_agent: head.get("user-agent")?.slice(0, 300) ?? null,
    });
  } catch (e) {
    // The visitor's CHOICE is already saved in the cookie. A failed audit
    // write must never block them from using the site.
    console.error("[consent] audit write failed", e);
  }

  return { ok: true as const };
}

function truncateIp(ip?: string | null): string | null {
  if (!ip) return null;
  if (ip.includes(":")) return ip.split(":").slice(0, 3).join(":") + "::/48"; // IPv6
  const parts = ip.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0/24` : null;
}
