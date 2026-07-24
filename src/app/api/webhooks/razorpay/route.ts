// src/app/api/webhooks/razorpay/route.ts

import { NextResponse, type NextRequest } from "next/server";
import { razorpayProvider } from "@/features/payment/providers/razorpay.provider";
import { paymentService } from "@/features/payment/services/payment.service";

// Node runtime: the crypto APIs used for HMAC verification and the exact
// byte handling of the raw body are most reliable here.
export const runtime = "nodejs";
// Never cache a webhook.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-razorpay-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  // CRITICAL: read the body as TEXT and verify BEFORE parsing. Once the
  // body is consumed as JSON the original bytes are gone, and
  // re-serialising produces different whitespace, key order and Unicode
  // escaping — so the signature will never match.
  const rawBody = await request.text();

  let event: any;
  try {
    event = await razorpayProvider.verifyWebhook(rawBody, signature);
  } catch {
    // Do not leak why it failed.
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await paymentService.handleWebhook({
      provider: "razorpay",
      eventId: event.payload?.payment?.entity?.id ?? event.id ?? crypto.randomUUID(),
      eventType: event.event,
      payload: event,
      result: razorpayProvider.parseEvent(event),
    });
  } catch (e) {
    console.error("[webhook:razorpay] processing failed", e);
    // 500 asks the provider to retry. Our dedupe table makes that safe.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
