/**
 * THE MONEY FILE.
 *
 * Two rules govern everything here:
 *
 * 1. ALL ARITHMETIC IS IN INTEGER MINOR UNITS (paise). JavaScript numbers are
 *    IEEE-754 doubles: 0.1 + 0.2 === 0.30000000000000004. Summing rupee
 *    floats across a large cart drifts, and a store that is off by one paisa
 *    on an invoice has a real accounting problem. We convert at the edges
 *    and never do decimal arithmetic in between.
 *
 * 2. THIS MODULE IS PURE. No database, no network, no clock. That makes the
 *    most business-critical logic in the application exhaustively unit
 *    testable — which is exactly what Phase 16 will do to it.
 *
 * Totals are ALWAYS recomputed server-side from database prices. A total
 * submitted by a browser is a suggestion from an untrusted party.
 */

export type PricingLine = {
  variantId: string;
  /** Unit price in minor units, read from the database — never from the client. */
  unitPrice: number;
  quantity: number;
  /** Percentage, e.g. 18 for 18% GST. */
  taxRate: number;
};

export type CouponRule =
  | { type: "percent"; value: number; maxDiscount?: number | null }
  | { type: "fixed"; value: number };

export type ShippingRule = {
  flatRate: number;
  /** Free shipping once the post-discount subtotal reaches this. */
  freeOver: number;
};

export type PricedLine = PricingLine & {
  lineSubtotal: number;
  discountAllocated: number;
  taxableBase: number;
  tax: number;
  lineTotal: number;
};

export type CartTotals = {
  lines: PricedLine[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  shippingTotal: number;
  grandTotal: number;
};

export function toMinor(amount: number): number {
  return Math.round(amount * 100);
}

export function toMajor(minor: number): number {
  return minor / 100;
}

export function computeTotals(
  lines: PricingLine[],
  options: { coupon?: CouponRule | null; shipping: ShippingRule },
): CartTotals {
  const lineSubtotals = lines.map((l) => l.unitPrice * l.quantity);
  const subtotal = sum(lineSubtotals);

  const discountTotal = clamp(computeDiscount(subtotal, options.coupon), 0, subtotal);

  // Allocate the discount across lines proportionally, then tax each line on
  // its DISCOUNTED base. Taxing the pre-discount amount would overcharge the
  // customer; discounting after tax would understate the tax owed.
  const allocations = allocateProportionally(discountTotal, lineSubtotals);

  const priced: PricedLine[] = lines.map((line, i) => {
    const lineSubtotal = lineSubtotals[i]!;
    const discountAllocated = allocations[i]!;
    const taxableBase = lineSubtotal - discountAllocated;
    // Round tax per line, not once on the total — this is what invoicing
    // rules generally require, and it keeps line items self-consistent.
    const tax = Math.round((taxableBase * line.taxRate) / 100);

    return {
      ...line,
      lineSubtotal,
      discountAllocated,
      taxableBase,
      tax,
      lineTotal: taxableBase + tax,
    };
  });

  const taxTotal = sum(priced.map((l) => l.tax));

  const postDiscount = subtotal - discountTotal;
  const shippingTotal =
    postDiscount <= 0 || postDiscount >= options.shipping.freeOver
      ? 0
      : options.shipping.flatRate;

  return {
    lines: priced,
    subtotal,
    discountTotal,
    taxTotal,
    shippingTotal,
    grandTotal: postDiscount + taxTotal + shippingTotal,
  };
}

function computeDiscount(subtotal: number, coupon?: CouponRule | null): number {
  if (!coupon || subtotal <= 0) return 0;

  if (coupon.type === "fixed") return Math.min(coupon.value, subtotal);

  const raw = Math.round((subtotal * coupon.value) / 100);
  return coupon.maxDiscount ? Math.min(raw, coupon.maxDiscount) : raw;
}

/**
 * Largest-remainder allocation. Naive rounding of each share independently
 * can leave the allocated parts off by a paisa or two from the total, which
 * would make the invoice fail to reconcile. This distributes the rounding
 * remainder to the lines with the largest fractional part, so the parts
 * always sum EXACTLY to the whole.
 */
function allocateProportionally(total: number, weights: number[]): number[] {
  const weightSum = sum(weights);
  if (total <= 0 || weightSum <= 0) return weights.map(() => 0);

  const exact = weights.map((w) => (total * w) / weightSum);
  const floors = exact.map(Math.floor);
  let remainder = total - sum(floors);

  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac);

  const result = [...floors];
  for (const { index } of order) {
    if (remainder <= 0) break;
    result[index] = result[index]! + 1;
    remainder -= 1;
  }

  return result;
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
