// Place at: src/app/(admin)/admin/products/page.tsx
//
// This is the entire Products list screen. Note how little there is:
// the page fetches, the columns describe, the generic engine does the rest.
// Every other admin module is this same ~60 lines with different columns.

import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { requireAdmin } from "@/lib/auth/guards";
import { productService } from "@/features/products/services/product.service";
import { parseTableSearch } from "@/lib/data-table/table-search";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductsTable } from "@/features/products/components/products-table";

export const metadata = { title: "Products · Admin" };

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProductsPage({ searchParams }: PageProps) {
  await requireAdmin();
  const params = await searchParams;

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">Manage your catalog, pricing and visibility.</p>
        </div>
        <Button asChild>
          <Link href="/admin/products/new"><Plus className="size-4" /> New product</Link>
        </Button>
      </header>

      {/* key forces a fresh Suspense boundary per query, so filtering
          streams a skeleton instead of blocking the whole page. */}
      <Suspense key={JSON.stringify(params)} fallback={<TableSkeleton />}>
        <ProductsData searchParams={params} />
      </Suspense>
    </div>
  );
}

async function ProductsData({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const query = parseTableSearch(searchParams);
  const data = await productService.list(query);

  return <ProductsTable data={data} />;
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-[420px] w-full rounded-2xl" />
    </div>
  );
}
