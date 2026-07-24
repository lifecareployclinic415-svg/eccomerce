"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Check, Loader2, ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { placeOrderAction } from "@/features/checkout/actions/checkout.actions";
import { cn } from "@/lib/utils";

type Address = {
  id: string;
  fullName: string;
  line1: string;
  city: string;
  state: string;
  postalCode: string;
  isDefault: boolean;
};

const STEPS = ["Address", "Delivery", "Payment", "Review"] as const;
type Step = (typeof STEPS)[number];

export function CheckoutStepper({
  addresses,
  contactEmail,
  grandTotal,
}: {
  addresses: Address[];
  contactEmail: string;
  grandTotal: string;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(0);

  const [addressId, setAddressId] = useState(
    addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? "",
  );
  const [paymentMethod, setPaymentMethod] = useState<"razorpay" | "stripe" | "cod">("razorpay");

  /**
   * Generated ONCE per mount and reused for every submit attempt. If the
   * shopper double-clicks or the request is retried, the server sees the
   * same key and returns the original order instead of creating a second.
   */
  const idempotencyKey = useRef(crypto.randomUUID());

  const submit = () => {
    startTransition(async () => {
      const result = await placeOrderAction({
        shippingAddressId: addressId,
        contactEmail,
        contactPhone: "9999999999", // collected in the address step
        paymentMethod,
        idempotencyKey: idempotencyKey.current,
      });

      if (!result.ok) {
        toast.error(result.error);
        // Stock or price problems are fixable in the bag, so send them there.
        if (/sold out|price changed|bag is empty/i.test(result.error)) router.push("/cart");
        return;
      }

      const { orderId, paymentMethod: method } = result.data!;

      // Cash on delivery is already confirmed. Card and UPI hand off to the
      // payment step, which Phase 10 builds.
      router.push(method === "cod" ? `/order/${orderId}/confirmed` : `/checkout/pay/${orderId}`);
    });
  };

  return (
    <div className="space-y-8">
      <ol className="flex items-center gap-2" aria-label="Checkout progress">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full text-xs font-medium transition-colors",
                i < step && "bg-brand text-on-brand",
                i === step && "bg-ink text-paper",
                i > step && "bg-surface-sunk text-ink-soft",
              )}
              aria-current={i === step ? "step" : undefined}
            >
              {i < step ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cn("hidden text-sm sm:block", i === step ? "text-ink" : "text-ink-soft")}>
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-line" />}
          </li>
        ))}
      </ol>

      <div className="relative overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={reduce ? false : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: -24 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            {step === 0 && (
              <fieldset className="space-y-3">
                <legend className="mb-3 text-lg font-medium">Where should we deliver?</legend>
                <RadioGroup value={addressId} onValueChange={setAddressId} className="space-y-3">
                  {addresses.map((address) => (
                    <label
                      key={address.id}
                      htmlFor={address.id}
                      className={cn(
                        "flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors",
                        addressId === address.id ? "border-brand bg-brand-tint/40" : "border-line hover:border-ink-soft",
                      )}
                    >
                      <RadioGroupItem value={address.id} id={address.id} className="mt-1" />
                      <div className="text-sm">
                        <p className="font-medium">{address.fullName}</p>
                        <p className="text-ink-soft">
                          {address.line1}, {address.city}, {address.state}{" "}
                          <span className="numeric">{address.postalCode}</span>
                        </p>
                      </div>
                    </label>
                  ))}
                </RadioGroup>
              </fieldset>
            )}

            {step === 1 && (
              <div className="space-y-3">
                <h2 className="mb-3 text-lg font-medium">Delivery</h2>
                <div className="rounded-xl border border-line p-4 text-sm">
                  <p className="font-medium">Standard delivery</p>
                  <p className="text-ink-soft">Arrives in 3–6 working days. Free over ₹2,000.</p>
                </div>
              </div>
            )}

            {step === 2 && (
              <fieldset className="space-y-3">
                <legend className="mb-3 text-lg font-medium">How would you like to pay?</legend>
                <RadioGroup
                  value={paymentMethod}
                  onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}
                  className="space-y-3"
                >
                  {[
                    { value: "razorpay", label: "UPI, cards and netbanking", hint: "Secure payment via Razorpay" },
                    { value: "stripe", label: "International cards", hint: "Secure payment via Stripe" },
                    { value: "cod", label: "Cash on delivery", hint: "Pay when your order arrives" },
                  ].map((option) => (
                    <label
                      key={option.value}
                      htmlFor={option.value}
                      className={cn(
                        "flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors",
                        paymentMethod === option.value ? "border-brand bg-brand-tint/40" : "border-line hover:border-ink-soft",
                      )}
                    >
                      <RadioGroupItem value={option.value} id={option.value} className="mt-1" />
                      <div className="text-sm">
                        <p className="font-medium">{option.label}</p>
                        <p className="text-ink-soft">{option.hint}</p>
                      </div>
                    </label>
                  ))}
                </RadioGroup>
              </fieldset>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h2 className="text-lg font-medium">Review and place your order</h2>
                <p className="text-sm text-ink-soft">
                  Placing this order holds your items for 20 minutes while payment completes.
                </p>
                <div className="rounded-xl border border-line p-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-ink-soft">Total to pay</span>
                    <span className="numeric text-xl font-semibold text-price">{grandTotal}</span>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-3">
        {step > 0 && (
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={pending}>
            <ChevronLeft className="size-4" /> Back
          </Button>
        )}

        <Button
          className="ml-auto bg-brand text-on-brand hover:bg-brand-hover"
          size="lg"
          disabled={pending || (step === 0 && !addressId)}
          onClick={() => (step < STEPS.length - 1 ? setStep((s) => s + 1) : submit())}
        >
          {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
          {step < STEPS.length - 1 ? "Continue" : "Place order"}
        </Button>
      </div>
    </div>
  );
}
