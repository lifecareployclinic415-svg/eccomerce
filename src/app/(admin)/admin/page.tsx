import { requireAdmin } from "@/lib/auth/guards";
import { reportsService } from "@/features/analytics/services/reports.service";

export const metadata = { title: "Dashboard" };

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export default async function AdminDashboard() {
  await requireAdmin();

  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
  const summary = await reportsService.summaryWithComparison({ from, to });

  const cards = [
    { label: "Net revenue", value: inr.format(summary.netRevenue), change: summary.change.revenue },
    { label: "Orders", value: String(summary.orders), change: summary.change.orders },
    { label: "Average order", value: inr.format(summary.averageOrderValue), change: summary.change.averageOrderValue },
    { label: "Refunded", value: inr.format(summary.refunded), change: null },
  ];

  return (
    <div className="space-y-8 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-ink-soft">Last 30 days, compared with the previous 30.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-xs uppercase tracking-wider text-ink-soft">{card.label}</p>
            <p className="numeric mt-2 text-2xl font-semibold">{card.value}</p>
            {card.change != null && (
              <p className={card.change >= 0 ? "mt-1 text-xs text-success" : "mt-1 text-xs text-danger"}>
                {card.change >= 0 ? "▲" : "▼"} {Math.abs(card.change).toFixed(1)}%
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
