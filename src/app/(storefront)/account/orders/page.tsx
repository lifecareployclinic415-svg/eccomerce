import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Your orders", robots: { index: false } };

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

export default async function OrdersPage() {
  const user = await requireUser("/account/orders");

  const { data } = await createAdminClient()
    .from("orders")
    .select("id, order_number, status, grand_total, placed_at")
    .eq("user_id", user.id)
    .order("placed_at", { ascending: false });

  const orders = data ?? [];

  if (!orders.length) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
        <h1 className="text-2xl font-semibold">No orders yet</h1>
        <p className="mt-2 text-sm text-ink-soft">When you place one, it will show up here.</p>
        <Link href="/shop" className="mt-6 inline-block text-sm underline underline-offset-4">Start shopping</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold">Your orders</h1>

      <table className="mt-8 w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-ink-soft">
            <th className="pb-3 font-normal">Order</th>
            <th className="pb-3 font-normal">Placed</th>
            <th className="pb-3 font-normal">Status</th>
            <th className="pb-3 text-right font-normal">Total</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-b border-line/60">
              <td className="py-3">
                <Link href={`/account/orders/${order.id}`} className="numeric underline-offset-4 hover:underline">
                  {order.order_number}
                </Link>
              </td>
              <td className="py-3 text-ink-soft">
                {new Date(order.placed_at).toLocaleDateString("en-IN")}
              </td>
              <td className="py-3"><Badge variant="secondary">{order.status}</Badge></td>
              <td className="numeric py-3 text-right text-price">{inr.format(Number(order.grand_total))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
