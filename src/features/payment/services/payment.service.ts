import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { razorpayProvider } from "@/features/payment/providers/razorpay.provider";
import { stripeProvider } from "@/features/payment/providers/stripe.provider";
import type { PaymentProvider, WebhookResult } from "@/features/payment/providers/payment.provider";

const PROVIDERS: Record<string, PaymentProvider> = {
  razorpay: razorpayProvider,
  stripe: stripeProvider,
};

export const paymentService = {
  /**
   * Records the event FIRST, then acts on it.
   *
   * Ordering matters: if we processed first and the insert failed, a replay
   * would process the same payment twice. Recording first means the unique
   * (provider, event_id) constraint rejects the duplicate before any money
   * or stock moves.
   */
  async handleWebhook(params: {
    provider: "stripe" | "razorpay";
    eventId: string;
    eventType: string;
    payload: unknown;
    result: WebhookResult;
  }) {
    const db = createAdminClient();

    const { data: recorded, error: insertError } = await db
      .from("webhook_events")
      .insert({
        provider: params.provider,
        event_id: params.eventId,
        event_type: params.eventType,
        payload: params.payload as Record<string, unknown>,
      })
      .select("id")
      .single();

    // 23505 = unique violation → we have seen this event before.
    if (insertError?.code === "23505") {
      console.info("[payment] duplicate webhook ignored", params.eventId);
      return;
    }
    if (insertError) throw new Error(`Could not record webhook: ${insertError.message}`);

    try {
      await this.applyEvent(params.result);

      await db
        .from("webhook_events")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", recorded.id);
    } catch (e) {
      // Leave processed_at null and store the error, so the row is both a
      // dead-letter record and a replay candidate.
      await db
        .from("webhook_events")
        .update({ error: e instanceof Error ? e.message : String(e) })
        .eq("id", recorded.id);
      throw e;
    }
  },

  async applyEvent(result: WebhookResult) {
    const db = createAdminClient();

    switch (result.kind) {
      case "paid": {
        if (!result.orderId) throw new Error("Webhook has no order id in metadata");

        // The SQL function re-checks the amount against the order and
        // finalises stock + invoice atomically.
        const { error } = await db.rpc("mark_payment_paid", {
          p_order_id: result.orderId,
          p_provider: currentProviderOf(result.providerPaymentId),
          p_provider_payment_id: result.providerPaymentId,
          p_amount: result.amountMinor / 100,
          p_method: result.method,
          p_raw: {} as Record<string, unknown>,
        });
        if (error) throw new Error(error.message);

        // Confirmation email. Non-blocking: an email failure must never
        // fail a webhook and trigger a provider retry storm.
        void db.functions
          .invoke("send-order-email", { body: { orderId: result.orderId } })
          .catch((e) => console.error("[payment] email failed", e));
        return;
      }

      case "failed": {
        if (!result.orderId) return;
        const { error } = await db.rpc("mark_payment_failed", {
          p_order_id: result.orderId,
          p_provider: currentProviderOf(result.providerPaymentId),
          p_provider_payment_id: result.providerPaymentId,
          p_reason: result.reason,
          p_raw: {} as Record<string, unknown>,
        });
        if (error) throw new Error(error.message);
        return;
      }

      case "refunded": {
        const { data: payment } = await db
          .from("payments")
          .select("order_id")
          .eq("provider_payment_id", result.providerPaymentId)
          .maybeSingle();

        if (!payment) return;

        const { data: refund } = await db
          .from("refunds")
          .select("id")
          .eq("order_id", payment.order_id)
          .in("status", ["pending", "processing"])
          .maybeSingle();

        if (!refund) return;

        const { error } = await db.rpc("process_refund", {
          p_refund_id: refund.id,
          p_provider_refund_id: result.providerRefundId,
        });
        if (error) throw new Error(error.message);
        return;
      }

      case "ignored":
        return;
    }
  },

  /** Opens a provider session for an order that is still awaiting payment. */
  async createSession(orderId: string) {
    const db = createAdminClient();

    const { data: order } = await db
      .from("orders")
      .select("id, order_number, grand_total, currency, contact_email, status, payment_method")
      .eq("id", orderId)
      .maybeSingle();

    if (!order) throw new Error("Order not found");
    if (order.status !== "pending") throw new Error("This order is no longer awaiting payment");
    if (order.payment_method === "cod") throw new Error("Cash on delivery needs no payment session");

    const provider = PROVIDERS[order.payment_method!];
    if (!provider) throw new Error("Unsupported payment method");

    const session = await provider.createSession({
      orderId: order.id,
      orderNumber: order.order_number,
      amountMinor: Math.round(Number(order.grand_total) * 100),
      currency: order.currency ?? "INR",
      contactEmail: order.contact_email ?? "",
    });

    await db.from("payments").insert({
      order_id: order.id,
      provider: provider.id,
      provider_order_id: session.providerOrderId,
      amount: order.grand_total,
      status: "pending",
    });

    return session;
  },

  /**
   * Retry after a failed attempt. Extends the stock reservation so the
   * shopper is not racing the sweeper while they re-enter card details.
   */
  async retryPayment(orderId: string) {
    const db = createAdminClient();
    const { error } = await db.rpc("extend_order_reservation", {
      p_order_id: orderId,
      p_minutes: 20,
    });
    if (error) throw new Error(error.message);
    return this.createSession(orderId);
  },

  /**
   * Admin-initiated refund. Creates the local record FIRST, then calls the
   * provider — so if the provider call succeeds but our response is lost,
   * the incoming webhook still finds a refund row to complete.
   */
  async requestRefund(params: {
    orderId: string;
    amountMinor: number;
    reason?: string;
    requestedBy: string;
  }) {
    const db = createAdminClient();

    const { data: payment } = await db
      .from("payments")
      .select("id, provider, provider_payment_id, amount")
      .eq("order_id", params.orderId)
      .eq("status", "paid")
      .maybeSingle();

    if (!payment?.provider_payment_id) throw new Error("No captured payment to refund");
    if (params.amountMinor > Math.round(Number(payment.amount) * 100)) {
      throw new Error("Refund exceeds the amount paid");
    }

    const { data: refund, error } = await db
      .from("refunds")
      .insert({
        order_id: params.orderId,
        payment_id: payment.id,
        amount: params.amountMinor / 100,
        reason: params.reason,
        status: "processing",
        requested_by: params.requestedBy,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    const provider = PROVIDERS[payment.provider];
    if (!provider) throw new Error("Unsupported provider");

    try {
      const { providerRefundId } = await provider.refund({
        providerPaymentId: payment.provider_payment_id,
        amountMinor: params.amountMinor,
        reason: params.reason,
      });

      // COD refunds never reach here; card/UPI refunds are completed by the
      // webhook, but we record the id immediately so the two can be matched.
      await db.from("refunds").update({ provider_refund_id: providerRefundId }).eq("id", refund.id);

      return { refundId: refund.id, providerRefundId };
    } catch (e) {
      await db.from("refunds").update({ status: "rejected" }).eq("id", refund.id);
      throw e;
    }
  },
};

/** Stripe payment intents start with `pi_`; Razorpay payments with `pay_`. */
function currentProviderOf(providerPaymentId: string): "stripe" | "razorpay" {
  return providerPaymentId.startsWith("pi_") || providerPaymentId.startsWith("ch_")
    ? "stripe"
    : "razorpay";
}
