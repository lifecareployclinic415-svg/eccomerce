import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/guards";
import { RazorpayCheckout } from "@/features/payment/components/razorpay-checkout";

export const metadata = { title: "Payment", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PayPage({
  params,
}: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;

  const { data: order } = await createAdminClient()
    .from("orders")
    .select("id, order_number, contact_email, grand_total, status, user_id, payment_method")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) notFound();

  // Guest orders have no user_id and are reachable only via this link.
  const user = await getCurrentUser();
  if (order.user_id && order.user_id !== user?.id) notFound();

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center sm:px-6">
      <h1 className="text-2xl font-semibold">Complete your payment</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Order {order.order_number} · your items are held for 20 minutes.
      </p>

      <div className="mt-8">
        <RazorpayCheckout
          orderId={order.id}
          orderNumber={order.order_number}
          customerEmail={order.contact_email ?? ""}
        />
      </div>
    </div>
  );
}
