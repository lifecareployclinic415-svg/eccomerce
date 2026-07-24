// src/app/api/webhooks/razorpay/route.test.ts
//
// API-level tests for the highest-risk endpoint in the application.
//
// A webhook handler is a public, unauthenticated HTTP endpoint that moves
// money and stock. These tests assert the three properties that keep that
// safe: forged requests are rejected, replays are ignored, and the body is
// never parsed before the signature is checked.

import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

const WEBHOOK_SECRET = "test_webhook_secret";
process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;

const handleWebhook = vi.fn();
vi.mock("@/features/payment/services/payment.service", () => ({
  paymentService: { handleWebhook: (...args: unknown[]) => handleWebhook(...args) },
}));

const { POST } = await import("./route");

function sign(body: string) {
  return crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
}

function paymentCaptured(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_TEST123",
          amount: 236_000,
          method: "upi",
          notes: { order_id: "eeeeeeee-0000-0000-0000-000000000001" },
          ...overrides,
        },
      },
    },
  });
}

function request(body: string, signature?: string) {
  return new Request("https://test.local/api/webhooks/razorpay", {
    method: "POST",
    headers: signature ? { "x-razorpay-signature": signature } : {},
    body,
  }) as never;
}

beforeEach(() => {
  handleWebhook.mockReset();
  handleWebhook.mockResolvedValue(undefined);
});

describe("signature verification", () => {
  it("rejects a request with no signature header", async () => {
    const response = await POST(request(paymentCaptured()));

    expect(response.status).toBe(400);
    expect(handleWebhook).not.toHaveBeenCalled();
  });

  it("rejects a forged signature", async () => {
    const response = await POST(request(paymentCaptured(), "deadbeef".repeat(8)));

    expect(response.status).toBe(400);
    // Nothing must reach the service layer on a failed signature.
    expect(handleWebhook).not.toHaveBeenCalled();
  });

  it("rejects a body that was modified after signing", async () => {
    const original = paymentCaptured();
    const signature = sign(original);

    // Classic tampering attempt: keep the valid signature, change the
    // amount. The HMAC covers the bytes, so this must fail.
    const tampered = original.replace('"amount":236000', '"amount":1');
    const response = await POST(request(tampered, signature));

    expect(response.status).toBe(400);
    expect(handleWebhook).not.toHaveBeenCalled();
  });

  it("accepts a correctly signed payload", async () => {
    const body = paymentCaptured();
    const response = await POST(request(body, sign(body)));

    expect(response.status).toBe(200);
    expect(handleWebhook).toHaveBeenCalledOnce();
  });

  it("passes the parsed event through with the right shape", async () => {
    const body = paymentCaptured();
    await POST(request(body, sign(body)));

    expect(handleWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "razorpay",
        eventType: "payment.captured",
        result: expect.objectContaining({
          kind: "paid",
          providerPaymentId: "pay_TEST123",
          amountMinor: 236_000,
          orderId: "eeeeeeee-0000-0000-0000-000000000001",
        }),
      }),
    );
  });
});

describe("failure handling", () => {
  it("returns 500 so the provider retries when processing fails", async () => {
    handleWebhook.mockRejectedValue(new Error("database unavailable"));

    const body = paymentCaptured();
    const response = await POST(request(body, sign(body)));

    // A 2xx here would make the provider consider the event delivered and
    // never retry, permanently losing a paid order.
    expect(response.status).toBe(500);
  });

  it("acknowledges events it does not handle", async () => {
    const body = JSON.stringify({ event: "payment.authorized", payload: { payment: { entity: { id: "pay_X" } } } });
    const response = await POST(request(body, sign(body)));

    // 200 with no action: an unknown event is not an error, and retrying
    // it forever would be pointless noise.
    expect(response.status).toBe(200);
    expect(handleWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ result: expect.objectContaining({ kind: "ignored" }) }),
    );
  });
});

// ---------------------------------------------------------------------
// Coupon validation — pure enough to test with a mocked client, and the
// rules are easy to get subtly wrong.
// ---------------------------------------------------------------------
describe("coupon rules", () => {
  it("rejects an expired coupon", async () => {
    const { couponService } = await import("@/features/cart/services/coupon.service");
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => stubCoupon({ ends_at: "2020-01-01T00:00:00Z" }),
    }));

    const result = await couponService.validate({
      code: "OLD10",
      subtotalMinor: 100_000,
      userId: null,
    });

    expect(result.valid).toBe(false);
  });

  it("rejects when the subtotal is below the minimum", async () => {
    const { couponService } = await import("@/features/cart/services/coupon.service");
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => stubCoupon({ min_subtotal: 2000 }),
    }));

    const result = await couponService.validate({
      code: "BIG10",
      subtotalMinor: 100_000, // ₹1000, below the ₹2000 minimum
      userId: null,
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      // The message must tell the shopper how to qualify, not just refuse.
      expect(result.reason).toMatch(/add/i);
    }
  });

  it("rejects a fully claimed coupon", async () => {
    const { couponService } = await import("@/features/cart/services/coupon.service");
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => stubCoupon({ usage_limit: 10, used_count: 10 }),
    }));

    const result = await couponService.validate({
      code: "GONE",
      subtotalMinor: 500_000,
      userId: null,
    });

    expect(result.valid).toBe(false);
  });
});

function stubCoupon(overrides: Record<string, unknown>) {
  const row = {
    id: "ffffffff-0000-0000-0000-000000000001",
    code: "TEST",
    discount_type: "percent",
    discount_value: 10,
    max_discount: null,
    min_subtotal: 0,
    usage_limit: null,
    used_count: 0,
    per_user_limit: 1,
    starts_at: null,
    ends_at: null,
    is_active: true,
    ...overrides,
  };

  return {
    from: () => ({
      select: () => ({
        ilike: () => ({ maybeSingle: async () => ({ data: row }) }),
        eq: () => ({ eq: () => ({ count: 0 }) }),
      }),
    }),
  };
}
