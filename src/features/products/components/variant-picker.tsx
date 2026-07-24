"use client";

import { useMemo, useState } from "react";
import { AddToCartButton } from "@/features/cart/components/add-to-cart-button";
import { cn } from "@/lib/utils";

type Variant = {
  id: string;
  sku: string;
  price: number;
  attributes: Record<string, string> | null;
  available: number;
};

/**
 * Derives option groups (Size, Colour…) from each variant's attributes JSON,
 * so adding a new option type needs no schema change and no code change.
 */
export function VariantPicker({ variants }: { productId: string; variants: Variant[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const v of variants) {
      for (const [key, value] of Object.entries(v.attributes ?? {})) {
        if (!map.has(key)) map.set(key, new Set());
        map.get(key)!.add(value);
      }
    }
    return [...map.entries()].map(([name, values]) => ({ name, values: [...values] }));
  }, [variants]);

  const [selection, setSelection] = useState<Record<string, string>>(() => {
    const first = variants.find((v) => v.available > 0) ?? variants[0];
    return (first?.attributes as Record<string, string>) ?? {};
  });

  const selected = variants.find((v) =>
    Object.entries(selection).every(([k, val]) => (v.attributes ?? {})[k] === val),
  ) ?? (groups.length === 0 ? variants[0] : undefined);

  const soldOut = !selected || selected.available <= 0;

  return (
    <div className="mt-8 space-y-6">
      {groups.map((group) => (
        <fieldset key={group.name}>
          <legend className="text-sm font-medium capitalize">{group.name}</legend>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {group.values.map((value) => {
              const active = selection[group.name] === value;
              // Grey out combinations that do not exist in stock.
              const possible = variants.some(
                (v) => (v.attributes ?? {})[group.name] === value && v.available > 0,
              );

              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelection((s) => ({ ...s, [group.name]: value }))}
                  className={cn(
                    "min-w-11 rounded-lg border px-3.5 py-2 text-sm transition-colors",
                    active ? "border-brand bg-brand-tint font-medium" : "border-line hover:border-ink-soft",
                    !possible && "opacity-40",
                  )}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      {selected && selected.available > 0 && selected.available <= 5 && (
        <p className="text-sm text-price">Only {selected.available} left</p>
      )}

      <AddToCartButton variantId={selected?.id ?? null} disabled={soldOut} />
      {soldOut && <p className="text-sm text-ink-soft">This option is currently sold out.</p>}
    </div>
  );
}
