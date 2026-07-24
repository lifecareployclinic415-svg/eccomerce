"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { cartService, MAX_PER_LINE } from "@/features/cart/services/cart.service";
import { couponService } from "@/features/cart/services/coupon.service";
import { getCurrentUser } from "@/lib/auth/guards";
import { rateLimit } from "@/lib/security/rate-limit";
import type { ActionResult } from "@/features/auth/schemas/auth.schema";

const COUPON_COOKIE = "cart_coupon";

const addSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(MAX_PER_LINE),
});

const updateSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.coerce.number().int().min(0).max(MAX_PER_LINE),
});

export async function addToCartAction(input: unknown): Promise<ActionResult<{ clamped: boolean }>> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That selection isn't valid" };

  try {
    const result = await cartService.addItem(parsed.data.variantId, parsed.data.quantity);
    revalidatePath("/cart");
    return { ok: true, data: { clamped: result.clamped } };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

export async function updateCartItemAction(input: unknown): Promise<ActionResult<{ quantity: number }>> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That quantity isn't valid" };

  try {
    const result = await cartService.updateQuantity(parsed.data.itemId, parsed.data.quantity);
    revalidatePath("/cart");
    return { ok: true, data: { quantity: result.quantity } };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

export async function removeCartItemAction(itemId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(itemId).success) return { ok: false, error: "Invalid item" };

  try {
    await cartService.removeItem(itemId);
    revalidatePath("/cart");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

/**
 * The applied code is kept in a cookie, not in the cart row. A coupon is a
 * pending intent, not part of the basket — and it is re-validated on every
 * read, so storing it costs nothing and cannot go stale in the database.
 */
export async function applyCouponAction(code: string): Promise<ActionResult<{ code: string }>> {
  // Brute-forcing codes is the obvious attack on a coupon endpoint.
  if (!(await rateLimit(`coupon:${(await getCurrentUser())?.id ?? "guest"}`, { limit: 10, windowSec: 600 }))) {
    return { ok: false, error: "Too many attempts. Try again shortly." };
  }

  const state = await cartService.getState();
  const user = await getCurrentUser();

  const check = await couponService.validate({
    code,
    subtotalMinor: state.totals.subtotal,
    userId: user?.id ?? null,
  });

  if (!check.valid) return { ok: false, error: check.reason };

  (await cookies()).set(COUPON_COOKIE, check.code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24,
    path: "/",
  });

  revalidatePath("/cart");
  return { ok: true, data: { code: check.code } };
}

export async function removeCouponAction(): Promise<ActionResult> {
  (await cookies()).delete(COUPON_COOKIE);
  revalidatePath("/cart");
  return { ok: true };
}

export async function getAppliedCouponCode(): Promise<string | null> {
  return (await cookies()).get(COUPON_COOKIE)?.value ?? null;
}

/** Call this from the sign-in and OAuth callback paths, after auth succeeds. */
export async function mergeCartAfterLoginAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  try {
    await cartService.mergeAfterLogin(user.id);
    revalidatePath("/cart");
  } catch {
    // A merge failure must never block sign-in. The guest cart is recoverable;
    // a blocked login is not acceptable.
  }
}

function msg(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}
