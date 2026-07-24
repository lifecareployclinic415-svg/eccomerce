"use client";

// Place at: src/features/products/components/products-table.tsx
//
// THIS FILE IS THE TEMPLATE. To add a new admin module (brands, coupons,
// blogs…), copy this file, change the columns, filters and actions.
// Nothing else needs writing — table, search, sort, pagination, bulk
// actions, exports, dialogs and states all come from the shared engine.

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";

import { DataTable } from "@/features/admin/components/data-table";
import { DataTableToolbar } from "@/features/admin/components/data-table-toolbar";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  bulkDeleteProductsAction, bulkEditProductsAction, exportProductsAction,
} from "@/features/products/actions/product.actions";
import type { Paginated } from "@/lib/data-table/table-search";
import type { ProductRow } from "@/features/products/repositories/product.repository";

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

const columns: ColumnDef<ProductRow, unknown>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(v) => row.toggleSelected(!!v)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
  },
  {
    accessorKey: "name",
    header: "Product",
    cell: ({ row }) => (
      <div className="min-w-[180px]">
        <Link
          href={`/admin/products/${row.original.id}`}
          className="font-medium underline-offset-4 hover:underline"
        >
          {row.original.name}
        </Link>
        <p className="text-xs text-muted-foreground">{row.original.brands?.name ?? "No brand"}</p>
      </div>
    ),
  },
  {
    accessorKey: "categories",
    header: "Category",
    cell: ({ row }) => row.original.categories?.name ?? "—",
  },
  {
    accessorKey: "base_price",
    header: "Price",
    cell: ({ row }) => (
      <div className="tabular-nums">
        {row.original.sale_price ? (
          <>
            <span className="font-medium">{currency.format(row.original.sale_price)}</span>
            <span className="ml-2 text-xs text-muted-foreground line-through">
              {currency.format(row.original.base_price)}
            </span>
          </>
        ) : (
          currency.format(row.original.base_price)
        )}
      </div>
    ),
  },
  {
    accessorKey: "is_published",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={row.original.is_published ? "default" : "secondary"}>
        {row.original.is_published ? "Published" : "Draft"}
      </Badge>
    ),
  },
  {
    accessorKey: "rating_avg",
    header: "Rating",
    cell: ({ row }) => <span className="tabular-nums">{row.original.rating_avg.toFixed(1)}</span>,
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Row actions">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/admin/products/${row.original.id}`}>Edit</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/product/${row.original.slug}`} target="_blank">View on store</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

export function ProductsTable({ data }: { data: Paginated<ProductRow> }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      sortableColumns={["name", "base_price", "created_at", "rating_avg", "is_published"]}
      emptyMessage="No products match these filters"
      toolbar={(selectedIds, clearSelection) => (
        <DataTableToolbar
          searchPlaceholder="Search products by name or slug…"
          filters={[
            {
              key: "is_published",
              label: "Status",
              options: [
                { label: "Published", value: "true" },
                { label: "Draft", value: "false" },
              ],
            },
          ]}
          selectedIds={selectedIds}
          clearSelection={clearSelection}
          onExport={exportProductsAction}
          exportFilename="products"
          onBulkDelete={(ids) => bulkDeleteProductsAction({ ids })}
          bulkEditSlot={
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkEditProductsAction({ ids: selectedIds, isPublished: true })}
            >
              Publish
            </Button>
          }
        />
      )}
    />
  );
}
