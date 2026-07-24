// src/features/cart/services/pricing.service.test.ts
//
// The most valuable test file in the project.
//
// Phase 8 kept this module pure — no database, no clock, no network —
// specifically so it could be tested exhaustively. Every branch here
// decides what a customer is charged, so this is the one place a 100%
// coverage bar is genuinely justified rather than cargo-culted.

import { describe, it, expect } from "vitest";
import {
  computeTotals,
  toMinor,
  toMajor,
  type PricingLine,
  type ShippingRule,
} from "./pricing.service";

const SHIPPING: ShippingRule = { flatRate: 9_900, freeOver: 200_000 }; // ₹99 / ₹2000

const line = (over: Partial<PricingLine> = {}): PricingLine => ({
  variantId: "v1",
  unitPrice: 100_000, // ₹1000
  quantity: 1,
  taxRate: 18,
  ...over,
});

describe("computeTotals — basics", () => {
  it("returns zeroed totals for an empty cart", () => {
    const totals = computeTotals([], { shipping: SHIPPING });

    expect(totals.subtotal).toBe(0);
    expect(totals.grandTotal).toBe(0);
    // No cart means no delivery charge — a ₹99 total on an empty bag
    // would be an absurd but very easy bug to ship.
    expect(totals.shippingTotal).toBe(0);
  });

  it("computes a single line with tax and shipping", () => {
    const totals = computeTotals([line()], { shipping: SHIPPING });

    expect(totals.subtotal).toBe(100_000);
    expect(totals.taxTotal).toBe(18_000);
    expect(totals.shippingTotal).toBe(9_900);
    expect(totals.grandTotal).toBe(127_900);
  });

  it("applies each line's own tax rate", () => {
    const totals = computeTotals(
      [
        line({ variantId: "a", unitPrice: 50_000, quantity: 2, taxRate: 18 }),
        line({ variantId: "b", unitPrice: 30_000, quantity: 1, taxRate: 5 }),
      ],
      { shipping: SHIPPING },
    );

    expect(totals.subtotal).toBe(130_000);
    expect(totals.taxTotal).toBe(18_000 + 1_500);
    expect(totals.grandTotal).toBe(130_000 + 19_500 + 9_900);
  });

  it("multiplies unit price by quantity", () => {
    const totals = computeTotals([line({ quantity: 3 })], { shipping: SHIPPING });
    expect(totals.subtotal).toBe(300_000);
  });
});

describe("coupons", () => {
  it("applies a percentage discount", () => {
    const totals = computeTotals([line()], {
      coupon: { type: "percent", value: 10 },
      shipping: SHIPPING,
    });

    expect(totals.discountTotal).toBe(10_000);
  });

  it("caps a percentage discount at maxDiscount", () => {
    const totals = computeTotals([line()], {
      // 20% of ₹1000 is ₹200, but the coupon caps at ₹150.
      coupon: { type: "percent", value: 20, maxDiscount: 15_000 },
      shipping: SHIPPING,
    });

    expect(totals.discountTotal).toBe(15_000);
  });

  it("never discounts more than the subtotal", () => {
    const totals = computeTotals([line({ unitPrice: 50_000 })], {
      coupon: { type: "fixed", value: 80_000 },
      shipping: SHIPPING,
    });

    // A ₹800 voucher on a ₹500 bag must not produce a negative total —
    // i.e. the shop paying the customer to take the goods.
    expect(totals.discountTotal).toBe(50_000);
    expect(totals.grandTotal).toBe(0);
    expect(totals.grandTotal).toBeGreaterThanOrEqual(0);
  });

  it("taxes the DISCOUNTED base, not the original price", () => {
    const totals = computeTotals([line()], {
      coupon: { type: "percent", value: 50 },
      shipping: SHIPPING,
    });

    // 18% of ₹500, not of ₹1000. Taxing the pre-discount amount
    // overcharges the customer and is the most common error in
    // hand-rolled cart maths.
    expect(totals.taxTotal).toBe(9_000);
  });
});

describe("discount allocation", () => {
  it("splits a discount across lines in proportion to their value", () => {
    const totals = computeTotals(
      [
        line({ variantId: "a", unitPrice: 100_000 }),
        line({ variantId: "b", unitPrice: 30_000 }),
      ],
      { coupon: { type: "percent", value: 20, maxDiscount: 10_000 }, shipping: SHIPPING },
    );

    // 100000:30000 → 7692.30 / 2307.69, rounded by largest remainder.
    expect(totals.lines[0]!.discountAllocated).toBe(7_692);
    expect(totals.lines[1]!.discountAllocated).toBe(2_308);
  });

  it("allocations always sum EXACTLY to the discount", () => {
    // Deliberately awkward numbers: prices that do not divide cleanly are
    // where naive per-line rounding drifts by a paisa and the invoice
    // stops reconciling.
    const cases: number[][] = [
      [33_333, 33_333, 33_334],
      [1, 1, 1, 1, 1, 1, 1],
      [99_991, 7, 100_003],
      [12_345, 67_890, 11, 999_999],
    ];

    for (const prices of cases) {
      for (const percent of [3, 7, 11, 33, 99]) {
        const totals = computeTotals(
          prices.map((unitPrice, i) => line({ variantId: `v${i}`, unitPrice })),
          { coupon: { type: "percent", value: percent }, shipping: SHIPPING },
        );

        const allocated = totals.lines.reduce((sum, l) => sum + l.discountAllocated, 0);
        expect(allocated).toBe(totals.discountTotal);
      }
    }
  });

  it("allocates nothing when there is no coupon", () => {
    const totals = computeTotals([line(), line({ variantId: "b" })], { shipping: SHIPPING });
    expect(totals.lines.every((l) => l.discountAllocated === 0)).toBe(true);
  });
});

describe("shipping", () => {
  it("charges the flat rate below the threshold", () => {
    const totals = computeTotals([line({ unitPrice: 199_900 })], { shipping: SHIPPING });
    expect(totals.shippingTotal).toBe(9_900);
  });

  it("is free at exactly the threshold", () => {
    const totals = computeTotals([line({ unitPrice: 200_000 })], { shipping: SHIPPING });
    expect(totals.shippingTotal).toBe(0);
  });

  it("uses the POST-discount subtotal to decide", () => {
    const totals = computeTotals([line({ unitPrice: 210_000 })], {
      coupon: { type: "fixed", value: 20_000 },
      shipping: SHIPPING,
    });

    // ₹2100 − ₹200 = ₹1900, which is below the ₹2000 threshold. Judging
    // free shipping on the pre-discount figure would give it away.
    expect(totals.shippingTotal).toBe(9_900);
  });
});

describe("integrity of the totals", () => {
  it("grandTotal equals subtotal − discount + tax + shipping", () => {
    const totals = computeTotals(
      [
        line({ variantId: "a", unitPrice: 74_999, quantity: 3, taxRate: 12 }),
        line({ variantId: "b", unitPrice: 12_345, quantity: 7, taxRate: 18 }),
        line({ variantId: "c", unitPrice: 1, quantity: 1, taxRate: 5 }),
      ],
      { coupon: { type: "percent", value: 17, maxDiscount: 50_000 }, shipping: SHIPPING },
    );

    expect(totals.grandTotal).toBe(
      totals.subtotal - totals.discountTotal + totals.taxTotal + totals.shippingTotal,
    );
  });

  it("line totals reconcile with the header totals", () => {
    const totals = computeTotals(
      [line({ variantId: "a" }), line({ variantId: "b", unitPrice: 45_500, taxRate: 5 })],
      { coupon: { type: "percent", value: 10 }, shipping: SHIPPING },
    );

    const lineSum = totals.lines.reduce((sum, l) => sum + l.lineTotal, 0);
    expect(lineSum).toBe(totals.subtotal - totals.discountTotal + totals.taxTotal);
  });

  it("every monetary value is a non-negative integer", () => {
    const totals = computeTotals([line({ unitPrice: 33_333, quantity: 3, taxRate: 18 })], {
      coupon: { type: "percent", value: 13 },
      shipping: SHIPPING,
    });

    const amounts = [
      totals.subtotal, totals.discountTotal, totals.taxTotal,
      totals.shippingTotal, totals.grandTotal,
      ...totals.lines.flatMap((l) => [l.lineSubtotal, l.discountAllocated, l.tax, l.lineTotal]),
    ];

    for (const amount of amounts) {
      expect(Number.isInteger(amount)).toBe(true);
      expect(amount).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("minor-unit conversion", () => {
  it("round-trips rupees through paise", () => {
    for (const rupees of [0, 1, 99.99, 1234.56, 99_999.01]) {
      expect(toMajor(toMinor(rupees))).toBeCloseTo(rupees, 2);
    }
  });

  it("resists the float drift that decimal arithmetic would produce", () => {
    // The reason the whole engine works in integers: 0.1 + 0.2 !== 0.3.
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(toMinor(0.1) + toMinor(0.2)).toBe(toMinor(0.3));

    // A hundred ₹0.07 items must be exactly ₹7.00, not ₹6.999999.
    const totals = computeTotals([line({ unitPrice: toMinor(0.07), quantity: 100, taxRate: 0 })], {
      shipping: { flatRate: 0, freeOver: 0 },
    });
    expect(totals.subtotal).toBe(700);
  });
});
