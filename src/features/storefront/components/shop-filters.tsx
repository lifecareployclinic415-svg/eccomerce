"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string; slug: string };

export function ShopFilters({
  categories, brands,
}: { categories: Option[]; brands: Option[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const set = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    value ? params.set(key, value) : params.delete(key);
    params.delete("page"); // a new filter always returns to page one
    router.push(`${pathname}?${params}`, { scroll: false });
  };

  const activeCategory = searchParams.get("category");
  const activeBrand = searchParams.get("brand");
  const hasFilters = Boolean(activeCategory || activeBrand || searchParams.get("q"));

  return (
    <div className="space-y-8">
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={() => router.push(pathname)} className="w-full justify-start">
          <X className="size-4" /> Clear filters
        </Button>
      )}

      <FilterGroup
        label="Category"
        options={categories}
        active={activeCategory}
        onSelect={(slug) => set("category", slug)}
        valueOf={(o) => o.slug}
      />

      <FilterGroup
        label="Brand"
        options={brands}
        active={activeBrand}
        onSelect={(id) => set("brand", id)}
        valueOf={(o) => o.id}
      />
    </div>
  );
}

function FilterGroup({
  label, options, active, onSelect, valueOf,
}: {
  label: string; options: Option[]; active: string | null;
  onSelect: (value: string | null) => void; valueOf: (o: Option) => string;
}) {
  if (!options.length) return null;

  return (
    <fieldset>
      <legend className="text-[11px] uppercase tracking-[0.14em] text-ink-soft">{label}</legend>
      <ul className="mt-3 space-y-1">
        {options.map((option) => {
          const value = valueOf(option);
          const isActive = active === value;
          return (
            <li key={option.id}>
              <button
                type="button"
                aria-pressed={isActive}
                onClick={() => onSelect(isActive ? null : value)}
                className={cn(
                  "w-full rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                  isActive ? "bg-brand-tint font-medium text-ink" : "text-ink-soft hover:text-ink",
                )}
              >
                {option.name}
              </button>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
