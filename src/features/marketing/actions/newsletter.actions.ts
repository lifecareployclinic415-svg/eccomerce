"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, limitKey, LIMITS } from "@/lib/security/rate-limit";
import type { ActionResult } from "@/features/auth/schemas/auth.schema";

export async function subscribeNewsletterAction(email: string): Promise<ActionResult> {
  const parsed = z.string().email().safeParse(email);
  if (!parsed.success) return { ok: false, error: "Enter a valid email address" };

  if (!(await rateLimit(await limitKey("newsletter"), LIMITS.newsletter))) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }

  const { error } = await createAdminClient()
    .from("newsletter")
    .upsert({ email: parsed.data, is_subscribed: true }, { onConflict: "email" });

  // Never reveal whether an address was already subscribed — that turns
  // this into an account-enumeration oracle.
  if (error) return { ok: false, error: "Could not subscribe right now" };
  return { ok: true };
}
