import "server-only";
import { cartRepository, type CartLine } from "@/features/cart/repositories/cart.repository";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeTotals, type CartTotals } from "@/features/cart/services/pricing.service";
import { couponService } from "@/features/cart/services/coupon.service";
import { getCurrentUser } from "@/lib/auth/guards";

export const MAX_PER_LINE = 10;

export type CartState = {
  cartId: string | null;
  lines: CartLine[];
  totals: CartTotals;
  coupon: { code: string; id: string } | null;
  /** Lines whose quantity had to be reduced or dropped since last visit. */
  adjustments: string[];
};

export const cartService = {
  /**
   * The single read path for the cart. Recomputes prices, tax and stock on
   * every call, and reports any line that had to be clamped so the UI can
   * tell the shopper what changed instead of silently altering their basket.
   */
  async getState(couponCode?: string | null): Promise<CartState> {
    const cartId = await cartRepository.resolveCartId(false);
    const shipping = await cartRepository.shippingRule();

    if (!cartId) {
      return {
        cartId: null,
        lines: [],
        totals: computeTotals([], { shipping }),
        coupon: null,
        adjustments: [],
      };
    }

    const raw = await cartRepository.getLines(cartId);
    const adjustments: string[] = [];

    const lines = raw.flatMap<CartLine>((line) => {
      if (line.available <= 0) {
        adjustments.push(`${line.name} is out of stock and was removed`);
        return [];
      }
      if (line.quantity > line.available) {
        adjustments.push(`${line.name} reduced to ${line.available} — that's all we have`);
        return [{ ...line, quantity: line.available }];
      }
      return [line];
    });

    const subtotal = lines.reduce((t, l) => t + l.unitPrice * l.quantity, 0);

    // Re-validate the coupon on every read: it may have expired, hit its
    // limit, or fallen below its minimum since it was applied.
    let coupon: CartState["coupon"] = null;
    let rule = null;

    if (couponCode) {
      const user = await getCurrentUser();
      const check = await couponService.validate({
        code: couponCode,
        subtotalMinor: subtotal,
        userId: user?.id ?? null,
      });

      if (check.valid) {
        coupon = { code: check.code, id: check.couponId };
        rule = check.rule;
      } else {
        adjustments.push(`Coupon removed: ${check.reason.toLowerCase()}`);
      }
    }

    return {
      cartId,
      lines,
      totals: computeTotals(
        lines.map((l) => ({
          variantId: l.variantId,
          unitPrice: l.unitPrice,
          quantity: l.quantity,
          taxRate: l.taxRate,
        })),
        { coupon: rule, shipping },
      ),
      coupon,
      adjustments,
    };
  },

  async addItem(variantId: string, quantity: number) {
    const available = await sellableStock(variantId);
    if (available <= 0) throw new Error("That item is out of stock");

    const cartId = await cartRepository.resolveCartId(true);
    if (!cartId) throw new Error("Could not open a cart");

    const db = createAdminClient();
    const { data: existing } = await db
      .from("cart_items")
      .select("id, quantity")
      .eq("cart_id", cartId)
      .eq("variant_id", variantId)
      .maybeSingle();

    const requested = (existing?.quantity ?? 0) + quantity;
    const finalQty = Math.min(requested, available, MAX_PER_LINE);

    if (existing) {
      await db.from("cart_items").update({ quantity: finalQty }).eq("id", existing.id);
    } else {
      await db.from("cart_items").insert({ cart_id: cartId, variant_id: variantId, quantity: finalQty });
    }

    // Tell the caller if we could not honour the full request, so the UI can
    // say so rather than quietly adding fewer than the shopper asked for.
    return { added: finalQty, clamped: finalQty < requested, available };
  },

  async updateQuantity(itemId: string, quantity: number) {
    if (quantity <= 0) return this.removeItem(itemId);

    const db = createAdminClient();
    const { data: item } = await db
      .from("cart_items").select("variant_id, cart_id").eq("id", itemId).maybeSingle();
    if (!item) throw new Error("That item is no longer in your bag");

    await assertOwnsCart(item.cart_id);

    const available = await sellableStock(item.variant_id);
    const finalQty = Math.min(quantity, available, MAX_PER_LINE);
    if (finalQty <= 0) return this.removeItem(itemId);

    await db.from("cart_items").update({ quantity: finalQty }).eq("id", itemId);
    return { quantity: finalQty, clamped: finalQty < quantity };
  },

  async removeItem(itemId: string) {
    const db = createAdminClient();
    const { data: item } = await db.from("cart_items").select("cart_id").eq("id", itemId).maybeSingle();
    if (item) {
      await assertOwnsCart(item.cart_id);
      await db.from("cart_items").delete().eq("id", itemId);
    }
    return { quantity: 0, clamped: false };
  },

  async clear() {
    const cartId = await cartRepository.resolveCartId(false);
    if (!cartId) return;
    await createAdminClient().from("cart_items").delete().eq("cart_id", cartId);
  },

  /** Called immediately after a successful sign-in. */
  async mergeAfterLogin(userId: string) {
    const sessionId = await cartRepository.getGuestSessionId();
    if (!sessionId) return;

    await cartRepository.mergeGuestCart(userId, sessionId);
    await cartRepository.clearGuestCookie();
  },
};

async function sellableStock(variantId: string): Promise<number> {
  const { data } = await createAdminClient()
    .from("variant_availability")
    .select("available, is_active")
    .eq("variant_id", variantId)
    .maybeSingle();

  return data?.is_active ? (data.available ?? 0) : 0;
}

/**
 * Because guest writes use the admin client (which bypasses RLS), ownership
 * must be re-asserted in code. Without this an attacker could mutate any
 * cart by guessing an item id.
 */
async function assertOwnsCart(cartId: string) {
  const owned = await cartRepository.resolveCartId(false);
  if (owned !== cartId) throw new Error("That item is not in your bag");
}
