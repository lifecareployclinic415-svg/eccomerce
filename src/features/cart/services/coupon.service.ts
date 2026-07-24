import "server-only";
import { createClient } from "@/lib/supabase/server";
import { toMinor, type CouponRule } from "@/features/cart/services/pricing.service";

export type CouponCheck =
  | { valid: true; couponId: string; code: string; rule: CouponRule }
  | { valid: false; reason: string };

/**
 * Coupon validation runs ONLY on the server. The coupons table has no public
 * read policy, so a client cannot enumerate live codes or inspect their
 * rules — it can only submit a code and be told yes or no.
 *
 * Every rejection returns a message written for the shopper, because "coupon
 * invalid" is the single most frustrating checkout dead end there is.
 */
export const couponService = {
  async validate(params: {
    code: string;
    subtotalMinor: number;
    userId: string | null;
  }): Promise<CouponCheck> {
    const code = params.code.trim();
    if (!code) return { valid: false, reason: "Enter a code" };

    const supabase = await createClient();

    // ilike matches case-insensitively against the lower(code) index.
    const { data: coupon } = await supabase
      .from("coupons")
      .select("*")
      .ilike("code", code)
      .maybeSingle();

    if (!coupon || !coupon.is_active) {
      return { valid: false, reason: "That code isn't valid" };
    }

    const now = new Date();
    if (coupon.starts_at && new Date(coupon.starts_at) > now) {
      return { valid: false, reason: "That code isn't active yet" };
    }
    if (coupon.ends_at && new Date(coupon.ends_at) < now) {
      return { valid: false, reason: "That code has expired" };
    }

    const minSubtotal = toMinor(Number(coupon.min_subtotal));
    if (params.subtotalMinor < minSubtotal) {
      const shortfall = (minSubtotal - params.subtotalMinor) / 100;
      return {
        valid: false,
        reason: `Add ₹${shortfall.toLocaleString("en-IN")} more to use this code`,
      };
    }

    if (coupon.usage_limit != null && coupon.used_count >= coupon.usage_limit) {
      return { valid: false, reason: "That code has been fully claimed" };
    }

    // Per-user limits only apply to signed-in shoppers; a guest has no
    // identity to count against. Guest abuse is bounded by usage_limit.
    if (params.userId) {
      const { count } = await supabase
        .from("coupon_redemptions")
        .select("id", { count: "exact", head: true })
        .eq("coupon_id", coupon.id)
        .eq("user_id", params.userId);

      if ((count ?? 0) >= coupon.per_user_limit) {
        return { valid: false, reason: "You've already used this code" };
      }
    }

    const rule: CouponRule =
      coupon.discount_type === "percent"
        ? {
            type: "percent",
            value: Number(coupon.discount_value),
            maxDiscount: coupon.max_discount ? toMinor(Number(coupon.max_discount)) : null,
          }
        : { type: "fixed", value: toMinor(Number(coupon.discount_value)) };

    return { valid: true, couponId: coupon.id, code: coupon.code, rule };
  },
};
