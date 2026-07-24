// src/app/(storefront)/order/[orderId]/confirmed/page.tsx

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { getConfirmationAction } from "@/features/checkout/actions/checkout.actions";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/shared/reveal";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

export const metadata = { title: "Order confirmed", robots: { index: false } };

export default async function OrderConfirmedPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const order = await getConfirmationAction(orderId);

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <Reveal className="text-center">
        <CheckCircle2 className="mx-auto size-12 text-success" />
        <h1 className="mt-5 text-4xl font-semibold">Thanks — your order is in</h1>
        <p className="mt-3 text-ink-soft">
          We've emailed a confirmation to {order.contact_email}. You can track it any time
          from your account.
        </p>
      </Reveal>

      <Reveal delay={0.08} className="mt-10 rounded-2xl border border-line p-6">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-soft">Order number</dt>
            <dd className="numeric font-medium">{order.order_number}</dd>
          </div>
          {order.invoice_number && (
            <div className="flex justify-between">
              <dt className="text-ink-soft">Invoice</dt>
              <dd className="numeric font-medium">{order.invoice_number}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-line pt-3">
            <dt className="font-medium">Total</dt>
            <dd className="numeric font-semibold text-price">
              {inr.format(Number(order.grand_total))}
            </dd>
          </div>
        </dl>
      </Reveal>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild className="bg-brand text-on-brand hover:bg-brand-hover">
          <Link href={`/account/orders/${order.id}`}>Track this order</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/account/orders/${order.id}/invoice`}>View invoice</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/shop">Keep shopping</Link>
        </Button>
      </div>
    </div>
  );
}
