// src/app/api/webhooks/stripe/route.ts

import { NextResponse, type NextRequest } from "next/server";
import { stripeProvider } from "@/features/payment/providers/stripe.provider";
import { paymentService } from "@/features/payment/services/payment.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const rawBody = await request.text();

  let event: any;
  try {
    event = await stripeProvider.verifyWebhook(rawBody, signature);
  } catch (e) {
    // In production this almost always means the TEST-mode signing secret
    // is configured against LIVE-mode events, or vice versa. Stripe signs
    // them with different secrets.
    console.error("[webhook:stripe] signature verification failed", e);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await paymentService.handleWebhook({
      provider: "stripe",
      eventId: event.id,
      eventType: event.type,
      payload: event,
      result: stripeProvider.parseEvent(event),
    });
  } catch (e) {
    console.error("[webhook:stripe] processing failed", e);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
