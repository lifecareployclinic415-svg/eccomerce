import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Replaces the in-memory limiter from Phase 5.
 *
 * The signature is unchanged, so no caller needs editing — that was the
 * point of putting it behind a function in the first place.
 */

export type RateLimitOptions = {
  limit: number;
  windowSec: number;
  /**
   * What to do if the limiter itself fails (database unreachable).
   *
   *   'open'   → allow the request. Correct for ordinary browsing: a
   *              database blip should not take the shop offline.
   *   'closed' → deny the request. Correct for login, password reset,
   *              coupon and payment paths, where the limiter IS the
   *              control and failing open hands an attacker free rein.
   */
  onError?: "open" | "closed";
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: Date | null;
};

export async function rateLimitDetailed(
  key: string,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const { limit, windowSec, onError = "open" } = options;

  try {
    const db = createAdminClient();
    const { data, error } = await db.rpc("check_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_sec: windowSec,
    });

    if (error) throw new Error(error.message);

    const row = Array.isArray(data) ? data[0] : data;
    return {
      allowed: Boolean(row?.allowed),
      remaining: Number(row?.remaining ?? 0),
      resetAt: row?.reset_at ? new Date(row.reset_at) : null,
    };
  } catch (e) {
    console.error("[rate-limit] check failed", { key, error: e });
    return { allowed: onError === "open", remaining: 0, resetAt: null };
  }
}

/** Boolean form, matching the original Phase 5 signature. */
export async function rateLimit(key: string, options: RateLimitOptions): Promise<boolean> {
  return (await rateLimitDetailed(key, options)).allowed;
}

/**
 * Builds a limiter key.
 *
 * IP alone is a weak identity — mobile carriers NAT thousands of users
 * behind one address, so a per-IP limit either punishes legitimate users
 * or is too loose to matter. Where an account or email exists, key on
 * that instead and use IP only as the fallback.
 */
export async function limitKey(scope: string, identity?: string | null): Promise<string> {
  if (identity) return `${scope}:id:${identity}`;

  const head = await headers();
  // Trust only the FIRST entry: downstream proxies append, and a client
  // can forge the rest of the chain.
  const ip = head.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return `${scope}:ip:${ip}`;
}

/**
 * Sensible defaults, centralised. Tuning limits in one place beats
 * rediscovering the right number at each call site.
 */
export const LIMITS = {
  login:        { limit: 10, windowSec: 900,  onError: "closed" as const },
  signup:       { limit: 5,  windowSec: 3600, onError: "closed" as const },
  passwordReset:{ limit: 5,  windowSec: 3600, onError: "closed" as const },
  coupon:       { limit: 10, windowSec: 600,  onError: "closed" as const },
  order:        { limit: 8,  windowSec: 600,  onError: "closed" as const },
  paymentRetry: { limit: 5,  windowSec: 900,  onError: "closed" as const },
  upload:       { limit: 60, windowSec: 600,  onError: "closed" as const },
  contactForm:  { limit: 5,  windowSec: 3600, onError: "closed" as const },
  newsletter:   { limit: 5,  windowSec: 3600, onError: "closed" as const },
  search:       { limit: 120, windowSec: 60,  onError: "open" as const },
} satisfies Record<string, RateLimitOptions>;
