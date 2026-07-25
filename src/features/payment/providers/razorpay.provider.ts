// src/features/payment/providers/razorpay.provider.ts

import "server-only";
import crypto from "crypto";
import type { PaymentProvider, PaymentSession, WebhookResult } from "./payment.provider";

const RZP_API = "https://api.razorpay.com/v1";

function getRazorpayKey() {
  const key = process.env.RAZORPAY_KEY_ID;
  if (!key) throw new Error("RAZORPAY_KEY_ID environment variable is not set");
  return key;
}

function getRazorpaySecret() {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) throw new Error("RAZORPAY_KEY_SECRET environment variable is not set");
  return secret;
}

function getRazorpayWebhookSecret() {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new Error("RAZORPAY_WEBHOOK_SECRET environment variable is not set");
  return secret;
}

function auth() {
  return "Basic " + Buffer.from(`${getRazorpayKey()}:${getRazorpaySecret()}`).toString("base64");
}

export const razorpayProvider: PaymentProvider = {
  id: "razorpay",

  async createSession({ orderId, orderNumber, amountMinor, currency }): Promise<PaymentSession> {
    const res = await fetch(`${RZP_API}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth() },
      body: JSON.stringify({
        amount: amountMinor,
        currency,
        receipt: orderNumber,
        // Carrying our order id in notes means the webhook can find the
        // order without a second lookup table.
        notes: { order_id: orderId },
      }),
    });

    if (!res.ok) throw new Error(`Razorpay order failed: ${await res.text()}`);
    const data = await res.json();

    return {
      providerOrderId: data.id,
      clientToken: getRazorpayKey(), // publishable key id, safe for the browser
      amountMinor,
      currency,
    };
  },

  async verifyWebhook(rawBody: string, signature: string) {
    const expected = crypto
      .createHmac("sha256", getRazorpayWebhookSecret())
      .update(rawBody)
      .digest("hex");

    if (!timingSafeEqual(expected, signature)) {
      throw new Error("Invalid Razorpay signature");
    }
    return JSON.parse(rawBody);
  },

  parseEvent(event: any): WebhookResult {
    const type = event?.event as string;
    const payment = event?.payload?.payment?.entity;

    if (type === "payment.captured" && payment) {
      return {
        kind: "paid",
        orderId: payment.notes?.order_id,
        providerPaymentId: payment.id,
        amountMinor: payment.amount,
        method: payment.method ?? "unknown",
      };
    }

    if (type === "payment.failed" && payment) {
      return {
        kind: "failed",
        orderId: payment.notes?.order_id,
        providerPaymentId: payment.id,
        reason: payment.error_description ?? "Payment failed",
      };
    }

    if (type === "refund.processed") {
      const refund = event?.payload?.refund?.entity;
      return {
        kind: "refunded",
        providerRefundId: refund.id,
        providerPaymentId: refund.payment_id,
      };
    }

    return { kind: "ignored" };
  },

  async refund({ providerPaymentId, amountMinor, reason }) {
    const res = await fetch(`${RZP_API}/payments/${providerPaymentId}/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth() },
      body: JSON.stringify({ amount: amountMinor, notes: { reason: reason ?? "" } }),
    });

    if (!res.ok) throw new Error(`Razorpay refund failed: ${await res.text()}`);
    const data = await res.json();
    return { providerRefundId: data.id };
  },
};

/**
 * Constant-time comparison. A plain `===` on a signature leaks information
 * through timing: an attacker can determine the correct signature byte by
 * byte from how long the comparison takes.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verifies the signature Razorpay Checkout hands the browser on success.
 * This is a UX shortcut only — it lets us show "payment received" straight
 * away. The WEBHOOK remains the authority for actually fulfilling the order.
 */
export function verifyRazorpayCheckoutSignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
}): boolean {
  const expected = crypto
    .createHmac("sha256", getRazorpaySecret())
    .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
    .digest("hex");

  return timingSafeEqual(expected, params.signature);
}
