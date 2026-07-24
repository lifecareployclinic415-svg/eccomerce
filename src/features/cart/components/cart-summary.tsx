"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applyCouponAction, removeCouponAction } from "@/features/cart/actions/cart.actions";
import type { CartTotals } from "@/features/cart/services/pricing.service";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
const fmt = (minor: number) => inr.format(minor / 100);

export function CartSummary({
  totals, couponCode,
}: { totals: CartTotals; couponCode: string | null }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <aside className="h-fit rounded-2xl border border-line bg-surface p-6 lg:sticky lg:top-24">
      <h2 className="font-sans text-sm font-semibold">Summary</h2>

      <dl className="mt-4 space-y-2.5 text-sm">
        <Row label="Subtotal" value={fmt(totals.subtotal)} />
        {totals.discountTotal > 0 && (
          <Row label={`Discount${couponCode ? ` (${couponCode})` : ""}`} value={`−${fmt(totals.discountTotal)}`} accent />
        )}
        <Row label="Tax" value={fmt(totals.taxTotal)} />
        <Row label="Delivery" value={totals.shippingTotal === 0 ? "Free" : fmt(totals.shippingTotal)} />

        <div className="flex justify-between border-t border-line pt-3 text-base font-semibold">
          <dt>Total</dt>
          <dd className="numeric text-price">{fmt(totals.grandTotal)}</dd>
        </div>
      </dl>

      {couponCode ? (
        <button
          type="button"
          onClick={() => startTransition(async () => { await removeCouponAction(); router.refresh(); })}
          className="mt-4 inline-flex items-center gap-1.5 text-xs text-ink-soft hover:text-ink"
        >
          <X className="size-3.5" /> Remove coupon
        </button>
      ) : (
        <form
          className="mt-5 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const result = await applyCouponAction(code);
              if (result.ok) { toast.success("Coupon applied"); router.refresh(); }
              else toast.error(result.error);
            });
          }}
        >
          <label htmlFor="coupon" className="sr-only">Coupon code</label>
          <Input id="coupon" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Coupon code" />
          <Button type="submit" variant="outline" disabled={pending || !code}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Apply"}
          </Button>
        </form>
      )}

      <Button asChild size="lg" className="mt-6 w-full bg-brand text-on-brand hover:bg-brand-hover">
        <a href="/checkout">Checkout</a>
      </Button>
    </aside>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-soft">{label}</dt>
      <dd className={accent ? "numeric text-price" : "numeric"}>{value}</dd>
    </div>
  );
}
