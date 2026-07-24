// Place at: src/app/(storefront)/shop/page.tsx
//
// Note how much this shares with the admin list pages: the same
// parseTableSearch helper, the same URL-as-state model, the same repository.
// The storefront is a different *presentation* of the same engine, which is
// exactly what the repository/service split bought us.

import { Suspense } from "react";
import Link from "next/link";

import { parseTableSearch } from "@/lib/data-table/table-search";
import { storefrontService } from "@/features/storefront/services/storefront.service";
import { ProductCard } from "@/features/products/components/product-card";
import { ProductGridSkeleton } from "@/features/products/components/product-grid-skeleton";
import { ShopFilters } from "@/features/storefront/components/shop-filters";
import { ShopPagination } from "@/features/storefront/components/shop-pagination";
import { StaggerGrid } from "@/components/shared/reveal";
import { Button } from "@/components/ui/button";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ShopPage({ searchParams }: PageProps) {
  const params = await searchParams;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-4xl font-semibold">Shop</h1>
        <p className="mt-2 text-ink-soft">Everything currently in stock.</p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[240px_1fr]">
        {/* Filters are a client island; the grid stays a server component. */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Suspense fallback={null}>
            <FilterPanel />
          </Suspense>
        </aside>

        <Suspense key={JSON.stringify(params)} fallback={<ProductGridSkeleton count={12} />}>
          <ProductResults searchParams={params} />
        </Suspense>
      </div>
    </div>
  );
}

async function FilterPanel() {
  const [categories, brands] = await Promise.all([
    storefrontService.allCategories(),
    storefrontService.allBrands(),
  ]);

  return <ShopFilters categories={categories} brands={brands} />;
}

async function ProductResults({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const query = parseTableSearch({ perPage: "24", ...searchParams });
  const { rows, total, page, pageCount } = await storefrontService.browse(query);

  // Empty state is an invitation to act, not an apology.
  if (!rows.length) {
    return (
      <div className="grid place-items-center rounded-2xl border border-line py-24 text-center">
        <div className="max-w-sm space-y-3">
          <h2 className="font-sans text-lg font-medium">No matches</h2>
          <p className="text-sm text-ink-soft">
            Nothing fits those filters right now. Try widening the price range or
            clearing a filter.
          </p>
          <Button asChild variant="outline">
            <Link href="/shop">Clear all filters</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-6 text-sm text-ink-soft">
        <span className="numeric">{total}</span> {total === 1 ? "product" : "products"}
      </p>

      <StaggerGrid className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3">
        {rows.map((p, i) => (
          <ProductCard key={p.id} product={p} priority={i < 6} />
        ))}
      </StaggerGrid>

      <ShopPagination page={page} pageCount={pageCount} />
    </div>
  );
}
