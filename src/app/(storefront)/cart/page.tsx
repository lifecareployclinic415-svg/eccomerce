import Link from "next/link";
import Image from "next/image";
import { ShoppingBag } from "lucide-react";

import { cartService } from "@/features/cart/services/cart.service";
import { getAppliedCouponCode } from "@/features/cart/actions/cart.actions";
import { QuantityStepper } from "@/features/cart/components/quantity-stepper";
import { CartSummary } from "@/features/cart/components/cart-summary";
import { CartRealtime } from "@/features/cart/components/cart-realtime";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Your bag", robots: { index: false } };
// Cart is per-visitor; caching it would serve one person's bag to another.
export const dynamic = "force-dynamic";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

export default async function CartPage() {
  const coupon = await getAppliedCouponCode();
  const state = await cartService.getState(coupon);

  if (!state.lines.length) {
    return (
      <div className="mx-auto grid max-w-md place-items-center px-4 py-24 text-center">
        <div className="rounded-full bg-surface-sunk p-5"><ShoppingBag className="size-7 text-ink-soft" /></div>
        <h1 className="mt-6 text-2xl font-semibold">Your bag is empty</h1>
        <p className="mt-2 text-sm text-ink-soft">Nothing in here yet.</p>
        <Button asChild className="mt-6 bg-brand text-on-brand hover:bg-brand-hover">
          <Link href="/shop">Start shopping</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <CartRealtime cartId={state.cartId} />
      <h1 className="text-3xl font-semibold">Your bag</h1>

      {/* Stock or price moved since the last visit — say so rather than
          silently altering someone's basket. */}
      {state.adjustments.length > 0 && (
        <ul role="alert" className="mt-6 space-y-1 rounded-xl bg-price-tint px-4 py-3 text-sm text-price">
          {state.adjustments.map((message) => <li key={message}>{message}</li>)}
        </ul>
      )}

      <div className="mt-8 grid gap-12 lg:grid-cols-[1fr_360px]">
        <ul className="space-y-6">
          {state.lines.map((line) => (
            <li key={line.itemId} className="flex gap-4 border-b border-line pb-6">
              <div className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-surface-sunk">
                {line.imageUrl && <Image src={line.imageUrl} alt="" fill sizes="96px" className="object-cover" />}
              </div>

              <div className="flex flex-1 flex-col justify-between">
                <div>
                  <Link href={`/product/${line.slug}`} className="font-medium underline-offset-4 hover:underline">
                    {line.name}
                  </Link>
                  {line.variantLabel && <p className="text-sm text-ink-soft">{line.variantLabel}</p>}
                </div>
                <QuantityStepper itemId={line.itemId} quantity={line.quantity} max={line.available} />
              </div>

              <p className="numeric text-sm font-medium text-price">
                {inr.format((line.unitPrice * line.quantity) / 100)}
              </p>
            </li>
          ))}
        </ul>

        <CartSummary totals={state.totals} couponCode={state.coupon?.code ?? null} />
      </div>
    </div>
  );
}
