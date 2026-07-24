// src/features/payment/components/razorpay-checkout.tsx

"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  createPaymentSessionAction,
  retryPaymentAction,
  confirmRazorpayCheckoutAction,
} from "@/features/payment/actions/payment.actions";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export function RazorpayCheckout({
  orderId,
  orderNumber,
  customerEmail,
}: {
  orderId: string;
  orderNumber: string;
  customerEmail: string;
}) {
  const router = useRouter();
  const [scriptReady, setScriptReady] = useState(false);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  const open = (retry = false) => {
    startTransition(async () => {
      const result = retry ? await retryPaymentAction(orderId) : await createPaymentSessionAction(orderId);

      if (!result.ok) {
        toast.error(result.error);
        setFailed(true);
        return;
      }

      const { providerOrderId, clientToken, amountMinor, currency } = result.data!;

      const checkout = new window.Razorpay({
        key: clientToken,
        amount: amountMinor,
        currency,
        order_id: providerOrderId,
        name: "Storefront",
        description: `Order ${orderNumber}`,
        prefill: { email: customerEmail },
        theme: { color: "#0B6B5B" },

        handler: async (response: Record<string, string>) => {
          const confirmed = await confirmRazorpayCheckoutAction({
            orderId,
            razorpayOrderId: response.razorpay_order_id!,
            razorpayPaymentId: response.razorpay_payment_id!,
            signature: response.razorpay_signature!,
          });

          // Even when this fails we still send them to the order page: the
          // webhook is the authority and may simply not have landed yet.
          if (!confirmed.ok) toast.warning("Confirming your payment — this can take a moment");

          router.push(`/order/${orderId}/confirmed`);
        },

        modal: {
          ondismiss: () => {
            setFailed(true);
            toast.info("Payment cancelled. Your items are held for 20 minutes.");
          },
        },
      });

      checkout.open();
    });
  };

  // Auto-open once, so the shopper is not asked to click twice.
  useEffect(() => {
    if (scriptReady && !failed) open(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptReady]);

  return (
    <>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        onReady={() => setScriptReady(true)}
        strategy="afterInteractive"
      />

      <div className="rounded-2xl border border-line p-6 text-center">
        {pending && !failed ? (
          <p className="flex items-center justify-center gap-2 text-sm text-ink-soft">
            <Loader2 className="size-4 animate-spin" /> Opening secure payment…
          </p>
        ) : failed ? (
          <div className="space-y-4">
            <div>
              <p className="font-medium">Payment not completed</p>
              <p className="mt-1 text-sm text-ink-soft">
                Your items are still reserved. You can try again with the same or a different method.
              </p>
            </div>
            <Button onClick={() => { setFailed(false); open(true); }} disabled={pending}
              className="bg-brand text-on-brand hover:bg-brand-hover">
              <RefreshCw className="size-4" /> Try payment again
            </Button>
          </div>
        ) : (
          <Button onClick={() => open(false)} disabled={!scriptReady}
            className="bg-brand text-on-brand hover:bg-brand-hover">
            Pay now
          </Button>
        )}
      </div>
    </>
  );
}
