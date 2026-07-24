"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
} from "@tanstack/react-table";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpDown, ChevronLeft, ChevronRight, Inbox } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Paginated } from "@/lib/data-table/table-search";

type Props<T> = {
  data: Paginated<T>;
  columns: ColumnDef<T, unknown>[];
  /** Column ids the server will accept for sorting. */
  sortableColumns?: string[];
  emptyMessage?: string;
  /** Rendered above the table; receives the current selection. */
  toolbar?: (selectedIds: string[], clear: () => void) => React.ReactNode;
  getRowId?: (row: T) => string;
};

/**
 * One table component serves all 28 admin modules. It is intentionally
 * "controlled by the URL": sorting and pagination push query params and let
 * the server re-render, rather than mutating client state. That keeps a
 * single source of truth and means deep links always reproduce the view.
 */
export function DataTable<T>({
  data,
  columns,
  sortableColumns = [],
  emptyMessage = "Nothing here yet",
  toolbar,
  getRowId = (row) => (row as { id: string }).id,
}: Props<T>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const table = useReactTable({
    data: data.rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
    manualPagination: true,
    manualSorting: true,
    pageCount: data.pageCount,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
  });

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);
  const clearSelection = () => setRowSelection({});

  const push = (patch: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(patch).forEach(([k, v]) => (v ? params.set(k, v) : params.delete(k)));
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }));
  };

  const toggleSort = (columnId: string) => {
    const current = searchParams.get("sort");
    const order = searchParams.get("order");
    const nextOrder = current === columnId && order === "asc" ? "desc" : "asc";
    push({ sort: columnId, order: nextOrder, page: "1" });
  };

  return (
    <div className="space-y-4">
      {toolbar?.(selectedIds, clearSelection)}

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/60 shadow-sm backdrop-blur-sm">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => {
                  const canSort = sortableColumns.includes(header.column.id);
                  return (
                    <TableHead key={header.id} className="whitespace-nowrap">
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(header.column.id)}
                          className="inline-flex items-center gap-1.5 font-medium transition-colors hover:text-foreground"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <ArrowUpDown className="size-3.5 opacity-50" />
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {/* Loading state: skeletons keep row height stable, no layout shift. */}
            {isPending &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {columns.map((_c, ci) => (
                    <TableCell key={ci}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!isPending && (
              <AnimatePresence initial={false}>
                {table.getRowModel().rows.map((row, i) => (
                  <motion.tr
                    key={row.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18, delay: Math.min(i * 0.015, 0.15) }}
                    data-state={row.getIsSelected() && "selected"}
                    className={cn(
                      "border-b border-border/40 transition-colors",
                      "hover:bg-muted/40 data-[state=selected]:bg-primary/5",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </motion.tr>
                ))}
              </AnimatePresence>
            )}

            {/* Empty state: never show a bare table with no rows. */}
            {!isPending && data.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-56">
                  <div className="flex flex-col items-center justify-center gap-3 text-center">
                    <div className="rounded-full bg-muted p-4">
                      <Inbox className="size-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">{emptyMessage}</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-sm text-muted-foreground">
          {data.total === 0
            ? "No results"
            : `Showing ${(data.page - 1) * data.perPage + 1}–${Math.min(data.page * data.perPage, data.total)} of ${data.total}`}
        </p>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={data.page <= 1 || isPending}
            onClick={() => push({ page: String(data.page - 1) })}
          >
            <ChevronLeft className="size-4" /> Previous
          </Button>
          <span className="px-2 text-sm tabular-nums text-muted-foreground">
            {data.page} / {data.pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={data.page >= data.pageCount || isPending}
            onClick={() => push({ page: String(data.page + 1) })}
          >
            Next <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
