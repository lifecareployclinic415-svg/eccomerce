import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/guards";

export type DateRange = { from: string; to: string };

/**
 * All reads hit the VIEWS from migration 0009, never raw tables. That
 * keeps the aggregation rules — which order statuses count as revenue,
 * how net differs from gross — defined in exactly one place, so the
 * dashboard, an export and a future email digest can never disagree about
 * what "revenue" means.
 */
export const reportsService = {
  /** Headline cards. Reads the materialized view, so it is cheap. */
  async summary(range: DateRange) {
    await requireAdmin();
    const db = createAdminClient();

    const { data } = await db
      .from("mv_dashboard_daily")
      .select("*")
      .gte("day", range.from)
      .lte("day", range.to)
      .order("day");

    const rows = data ?? [];
    const sum = (key: keyof (typeof rows)[number]) =>
      rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);

    const orders = sum("orders");
    const netRevenue = sum("net_revenue");
    const refunded = sum("refunded_amount");

    return {
      series: rows.map((row) => ({
        day: row.day as string,
        revenue: Number(row.net_revenue ?? 0),
        orders: Number(row.orders ?? 0),
      })),
      orders,
      netRevenue,
      refunded,
      collected: sum("total_collected"),
      // Guard the divide: an empty range must show ₹0, not NaN on screen.
      averageOrderValue: orders > 0 ? netRevenue / orders : 0,
    };
  },

  /**
   * Compares a range against the immediately preceding range of equal
   * length — "up 12% on last month" is only meaningful if the comparison
   * window is actually the same size.
   */
  async summaryWithComparison(range: DateRange) {
    const days = Math.max(
      1,
      Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000) + 1,
    );

    const previous: DateRange = {
      from: shiftDays(range.from, -days),
      to: shiftDays(range.from, -1),
    };

    const [current, prior] = await Promise.all([this.summary(range), this.summary(previous)]);

    return {
      ...current,
      change: {
        revenue: percentChange(current.netRevenue, prior.netRevenue),
        orders: percentChange(current.orders, prior.orders),
        averageOrderValue: percentChange(current.averageOrderValue, prior.averageOrderValue),
      },
    };
  },

  async topProducts(limit = 10) {
    await requireAdmin();
    const db = createAdminClient();

    const { data } = await db
      .from("report_product_performance")
      .select("product_id, name, slug, category, brand, units_sold, revenue, rating_avg")
      .order("revenue", { ascending: false })
      .limit(limit);

    return data ?? [];
  },

  async customerSegments() {
    await requireAdmin();
    const db = createAdminClient();

    const { data } = await db.from("report_customer_summary").select("segment, lifetime_value");

    const groups = new Map<string, { count: number; value: number }>();
    for (const row of data ?? []) {
      const key = row.segment as string;
      const entry = groups.get(key) ?? { count: 0, value: 0 };
      groups.set(key, {
        count: entry.count + 1,
        value: entry.value + Number(row.lifetime_value ?? 0),
      });
    }

    const purchasers = [...groups.entries()]
      .filter(([segment]) => segment !== "never_purchased")
      .reduce((total, [, entry]) => total + entry.count, 0);

    const repeat = groups.get("repeat")?.count ?? 0;

    return {
      segments: [...groups.entries()].map(([segment, entry]) => ({ segment, ...entry })),
      // The single most useful retention number a small store has.
      repeatRate: purchasers > 0 ? repeat / purchasers : 0,
    };
  },

  async inventoryHealth() {
    await requireAdmin();
    const db = createAdminClient();

    const { data } = await db
      .from("report_inventory_status")
      .select("stock_status, retail_value, product_name, sku, available, low_stock_threshold")
      .order("available", { ascending: true });

    const rows = data ?? [];

    return {
      totalRetailValue: rows.reduce((t, r) => t + Number(r.retail_value ?? 0), 0),
      outOfStock: rows.filter((r) => r.stock_status === "out_of_stock").length,
      lowStock: rows.filter((r) => r.stock_status === "low_stock").length,
      // The actionable list, not just the count.
      needsAttention: rows
        .filter((r) => r.stock_status !== "in_stock")
        .slice(0, 20),
    };
  },
};

function shiftDays(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Returns null rather than Infinity when the baseline is zero. */
function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}
