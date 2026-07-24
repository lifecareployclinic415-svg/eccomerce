// src/features/payment/actions/payment.actions.ts

"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { paymentService } from "@/features/payment/services/payment.service";
import { verifyRazorpayCheckoutSignature } from "@/features/payment/providers/razorpay.provider";
import { requireAdmin, getCurrentUser } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/security/rate-limit";
import type { ActionResult } from "@/features/auth/schemas/auth.schema";

export async function createPaymentSessionAction(orderId: string): Promise<ActionResult<{
  providerOrderId: string;
  clientToken: string;
  amountMinor: number;
  currency: string;
}>> {
  if (!z.string().uuid().safeParse(orderId).success) {
    return { ok: false, error: "Invalid order" };
  }
  if (!(await assertOwnsOrder(orderId))) {
    return { ok: false, error: "Order not found" };
  }

  try {
    const session = await paymentService.createSession(orderId);
    return { ok: true, data: session };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

export async function retryPaymentAction(orderId: string): Promise<ActionResult<{
  providerOrderId: string;
  clientToken: string;
  amountMinor: number;
  currency: string;
}>> {
  if (!(await assertOwnsOrder(orderId))) return { ok: false, error: "Order not found" };

  if (!(await rateLimit(`retry:${orderId}`, { limit: 5, windowSec: 900 }))) {
    return { ok: false, error: "Too many attempts. Please wait a moment." };
  }

  try {
    return { ok: true, data: await paymentService.retryPayment(orderId) };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

/**
 * Called when Razorpay Checkout returns success in the browser.
 *
 * This ONLY improves the user experience — it lets us route straight to the
 * confirmation page instead of polling. Fulfilment still waits on the
 * webhook. A client can lie about success; a signed webhook cannot.
 */
export async function confirmRazorpayCheckoutAction(input: {
  orderId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
}): Promise<ActionResult<{ verified: boolean }>> {
  if (!(await assertOwnsOrder(input.orderId))) return { ok: false, error: "Order not found" };

  const verified = verifyRazorpayCheckoutSignature({
    razorpayOrderId: input.razorpayOrderId,
    razorpayPaymentId: input.razorpayPaymentId,
    signature: input.signature,
  });

  if (!verified) return { ok: false, error: "We couldn't verify that payment" };

  revalidatePath(`/account/orders/${input.orderId}`);
  return { ok: true, data: { verified: true } };
}

const refundSchema = z.object({
  orderId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  reason: z.string().max(300).optional(),
});

export async function refundOrderAction(input: unknown): Promise<ActionResult<{ refundId: string }>> {
  const admin = await requireAdmin();

  const parsed = refundSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid refund request" };

  try {
    const result = await paymentService.requestRefund({
      orderId: parsed.data.orderId,
      amountMinor: Math.round(parsed.data.amount * 100),
      reason: parsed.data.reason,
      requestedBy: admin.id,
    });

    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${parsed.data.orderId}`);
    return { ok: true, data: { refundId: result.refundId } };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

async function assertOwnsOrder(orderId: string) {
  const user = await getCurrentUser();
  const db = createAdminClient();

  const { data } = await db.from("orders").select("user_id").eq("id", orderId).maybeSingle();
  if (!data) return false;

  // Guest orders have no user_id; those are reachable only via the
  // confirmation link, which carries the order id.
  return data.user_id === null || data.user_id === user?.id;
}

function msg(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}
