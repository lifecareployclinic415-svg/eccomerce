// src/features/payment/providers/stripe.provider.ts

import "server-only";
import Stripe from "stripe";
import type { PaymentProvider, PaymentSession, WebhookResult } from "./payment.provider";

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(secretKey);
}

export const stripeProvider: PaymentProvider = {
  id: "stripe",

  async createSession({ orderId, amountMinor, currency, contactEmail }): Promise<PaymentSession> {
    const intent = await getStripe().paymentIntents.create(
      {
        amount: amountMinor,
        currency: currency.toLowerCase(),
        receipt_email: contactEmail,
        automatic_payment_methods: { enabled: true },
        metadata: { order_id: orderId },
      },
      // Stripe's own idempotency layer, keyed to our order.
      { idempotencyKey: `order_${orderId}` },
    );

    return {
      providerOrderId: intent.id,
      clientToken: intent.client_secret!,
      amountMinor,
      currency,
    };
  },

  async verifyWebhook(rawBody: string, signature: string) {
    // constructEvent throws on a bad signature or a stale timestamp,
    // which also protects against replay of captured requests.
    return getStripe().webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  },

  parseEvent(event: any): WebhookResult {
    const object = event?.data?.object;

    switch (event?.type) {
      case "payment_intent.succeeded":
        return {
          kind: "paid",
          orderId: object.metadata?.order_id,
          providerPaymentId: object.id,
          amountMinor: object.amount_received ?? object.amount,
          method: object.payment_method_types?.[0] ?? "card",
        };

      case "payment_intent.payment_failed":
        return {
          kind: "failed",
          orderId: object.metadata?.order_id,
          providerPaymentId: object.id,
          reason: object.last_payment_error?.message ?? "Payment failed",
        };

      case "charge.refunded":
        return {
          kind: "refunded",
          providerRefundId: object.refunds?.data?.[0]?.id ?? object.id,
          providerPaymentId: object.payment_intent,
        };

      default:
        return { kind: "ignored" };
    }
  },

  async refund({ providerPaymentId, amountMinor, reason }) {
    const refund = await getStripe().refunds.create({
      payment_intent: providerPaymentId,
      amount: amountMinor,
      metadata: { reason: reason ?? "" },
    });
    return { providerRefundId: refund.id };
  },
};
