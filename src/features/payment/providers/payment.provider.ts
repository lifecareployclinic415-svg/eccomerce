// src/features/payment/providers/payment.provider.ts

import "server-only";

export type PaymentSession = {
  /** Opaque handle the client needs to open the provider's UI. */
  providerOrderId: string;
  /** Public key or client secret — safe to send to the browser. */
  clientToken: string;
  amountMinor: number;
  currency: string;
};

export type WebhookResult =
  | { kind: "paid"; orderId: string; providerPaymentId: string; amountMinor: number; method: string }
  | { kind: "failed"; orderId: string; providerPaymentId: string; reason: string }
  | { kind: "refunded"; providerRefundId: string; providerPaymentId: string }
  | { kind: "ignored" };

export interface PaymentProvider {
  readonly id: "stripe" | "razorpay" | "cod";

  createSession(params: {
    orderId: string;
    orderNumber: string;
    amountMinor: number;
    currency: string;
    contactEmail: string;
  }): Promise<PaymentSession>;

  /** MUST verify the signature against the RAW body bytes. */
  verifyWebhook(rawBody: string, signature: string): Promise<unknown>;

  parseEvent(event: unknown): WebhookResult;

  refund(params: {
    providerPaymentId: string;
    amountMinor: number;
    reason?: string;
  }): Promise<{ providerRefundId: string }>;
}
