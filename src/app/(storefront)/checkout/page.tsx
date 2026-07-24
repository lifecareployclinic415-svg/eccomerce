import { redirect } from "next/navigation";
import { cartService } from "@/features/cart/services/cart.service";
import { getAppliedCouponCode } from "@/features/cart/actions/cart.actions";
import { requireUser, getCurrentUser } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { CheckoutStepper } from "@/features/checkout/components/checkout-stepper";

export const metadata = { title: "Checkout", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

export default async function CheckoutPage() {
  const user = await requireUser("/checkout");
  const coupon = await getAppliedCouponCode();
  const state = await cartService.getState(coupon);

  // Never render a checkout for an empty bag.
  if (!state.lines.length) redirect("/cart");

  const { data } = await createAdminClient()
    .from("addresses")
    .select("id, full_name, line1, city, state, postal_code, is_default")
    .eq("user_id", user.id)
    .order("is_default", { ascending: false });

  const addresses = (data ?? []).map((a) => ({
    id: a.id, fullName: a.full_name, line1: a.line1,
    city: a.city, state: a.state, postalCode: a.postal_code, isDefault: a.is_default,
  }));

  const email = (await getCurrentUser())?.email ?? "";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="mb-8 text-3xl font-semibold">Checkout</h1>
      <CheckoutStepper
        addresses={addresses}
        contactEmail={email}
        grandTotal={inr.format(state.totals.grandTotal / 100)}
      />
    </div>
  );
}
