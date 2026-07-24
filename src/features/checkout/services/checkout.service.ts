import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { cartService } from "@/features/cart/services/cart.service";
import { cartRepository } from "@/features/cart/repositories/cart.repository";
import { couponService } from "@/features/cart/services/coupon.service";
import { toMajor } from "@/features/cart/services/pricing.service";
import { getCurrentUser } from "@/lib/auth/guards";
import type { CheckoutInput } from "@/features/checkout/schemas/checkout.schema";

export type PlaceOrderResult =
  | { ok: true; orderId: string; orderNumber: string; grandTotal: number }
  | { ok: false; code: PlaceOrderError; message: string };

export type PlaceOrderError =
  | "EMPTY_CART"
  | "INSUFFICIENT_STOCK"
  | "PRICE_CHANGED"
  | "INVALID_ADDRESS"
  | "UNKNOWN";

export const checkoutService = {
  /**
   * The order-placement pipeline.
   *
   * Everything the shopper's browser sent is treated as untrusted: the
   * address must belong to them, the totals are recomputed from database
   * prices, and the database itself re-verifies stock and price under a
   * row lock before writing. The browser's only real inputs are "which
   * address" and "which payment method".
   */
  async placeOrder(input: CheckoutInput): Promise<PlaceOrderResult> {
    const user = await getCurrentUser();
    const db = createAdminClient();

    // 1. Rebuild the cart from scratch — never trust a client-supplied cart.
    const state = await cartService.getState(input.couponCode ?? null);

    if (!state.cartId || state.lines.length === 0) {
      return { ok: false, code: "EMPTY_CART", message: "Your bag is empty" };
    }

    // If stock shifted while they were checking out, stop and show them.
    if (state.adjustments.length) {
      return {
        ok: false,
        code: "INSUFFICIENT_STOCK",
        message: state.adjustments[0]!,
      };
    }

    // 2. Verify the address actually belongs to this user. Without this an
    //    attacker could ship to any address id they can guess.
    const address = await this.verifyAddress(input.shippingAddressId, user?.id ?? null);
    if (!address) {
      return { ok: false, code: "INVALID_ADDRESS", message: "Choose a delivery address" };
    }

    // 3. Resolve the coupon id for redemption tracking.
    let couponId: string | null = null;
    if (state.coupon) {
      const check = await couponService.validate({
        code: state.coupon.code,
        subtotalMinor: state.totals.subtotal,
        userId: user?.id ?? null,
      });
      if (check.valid) couponId = check.couponId;
    }

    // 4. Hand the verified, priced order to the atomic transaction.
    const lines = state.totals.lines.map((line, i) => {
      const source = state.lines[i]!;
      return {
        variant_id: line.variantId,
        quantity: line.quantity,
        unit_price: toMajor(line.unitPrice),
        line_total: toMajor(line.lineTotal),
        product_name: source.name,
        variant_label: source.variantLabel,
      };
    });

    const totals = {
      subtotal: toMajor(state.totals.subtotal),
      discount_total: toMajor(state.totals.discountTotal),
      tax_total: toMajor(state.totals.taxTotal),
      shipping_total: toMajor(state.totals.shippingTotal),
      grand_total: toMajor(state.totals.grandTotal),
    };

    const { data, error } = await db.rpc("place_order", {
      p_cart_id: state.cartId,
      p_user_id: user?.id ?? null,
      p_contact_email: input.contactEmail,
      p_contact_phone: input.contactPhone,
      p_shipping_address_id: input.shippingAddressId,
      p_billing_address_id: input.billingAddressId ?? input.shippingAddressId,
      p_payment_method: input.paymentMethod,
      p_idempotency_key: input.idempotencyKey,
      p_coupon_id: couponId,
      p_coupon_code: state.coupon?.code ?? null,
      p_lines: lines,
      p_totals: totals,
      p_reserve_minutes: 20,
    });

    if (error) return mapDatabaseError(error.message);

    const order = Array.isArray(data) ? data[0] : data;
    if (!order) return { ok: false, code: "UNKNOWN", message: "Could not place the order" };

    // 5. Cash on delivery has no payment step, so it finalises immediately.
    //    Card and UPI orders stay 'pending' until the Phase 10 webhook fires.
    if (input.paymentMethod === "cod") {
      await db.rpc("finalize_paid_order", { p_order_id: order.id });
      await this.queueConfirmationEmail(order.id);
    }

    return {
      ok: true,
      orderId: order.id,
      orderNumber: order.order_number,
      grandTotal: Number(order.grand_total),
    };
  },

  async verifyAddress(addressId: string, userId: string | null) {
    if (!userId) return null;
    const db = createAdminClient();
    const { data } = await db
      .from("addresses")
      .select("id")
      .eq("id", addressId)
      .eq("user_id", userId)
      .maybeSingle();
    return data;
  },

  /**
   * Fire-and-forget. A failed email must never fail an order that has
   * already taken money — the order is the source of truth, the email is a
   * notification. Failures are logged and retried out of band.
   */
  async queueConfirmationEmail(orderId: string) {
    try {
      const db = createAdminClient();
      await db.functions.invoke("send-order-email", { body: { orderId } });
    } catch (e) {
      console.error("[checkout] confirmation email failed", { orderId, error: e });
    }
  },

  async getOrderForConfirmation(orderId: string) {
    const db = createAdminClient();
    const { data } = await db
      .from("orders")
      .select("*, order_items(*), addresses:shipping_address_id(*)")
      .eq("id", orderId)
      .maybeSingle();
    return data;
  },
};

/** Turns the SQL exception strings into messages a shopper can act on. */
function mapDatabaseError(message: string): PlaceOrderResult {
  if (message.includes("EMPTY_CART")) {
    return { ok: false, code: "EMPTY_CART", message: "Your bag is empty" };
  }
  if (message.includes("INSUFFICIENT_STOCK")) {
    return {
      ok: false,
      code: "INSUFFICIENT_STOCK",
      message: "Something in your bag just sold out. Review your bag and try again.",
    };
  }
  if (message.includes("PRICE_CHANGED")) {
    return {
      ok: false,
      code: "PRICE_CHANGED",
      message: "A price changed while you were checking out. Review your bag and try again.",
    };
  }
  console.error("[checkout] place_order failed", message);
  return { ok: false, code: "UNKNOWN", message: "We couldn't place that order. Please try again." };
}
