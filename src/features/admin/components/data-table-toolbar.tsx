"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Download, Trash2, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { downloadCsv, downloadExcel } from "@/lib/export/export";

export type FilterConfig = {
  key: string;
  label: string;
  options: { label: string; value: string }[];
};

type Props = {
  searchPlaceholder?: string;
  filters?: FilterConfig[];
  /** Server action returning the fully-filtered rows for export. */
  onExport?: (params: Record<string, string>) => Promise<
    { ok: true; data?: { rows: Record<string, unknown>[] } } | { ok: false; error: string }
  >;
  exportFilename?: string;
  selectedIds: string[];
  clearSelection: () => void;
  onBulkDelete?: (ids: string[]) => Promise<{ ok: boolean; error?: string }>;
  bulkEditSlot?: React.ReactNode;
};

export function DataTableToolbar({
  searchPlaceholder = "Search…",
  filters = [],
  onExport,
  exportFilename = "export",
  selectedIds,
  clearSelection,
  onBulkDelete,
  bulkEditSlot,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [exporting, setExporting] = useState(false);

  const [term, setTerm] = useState(searchParams.get("q") ?? "");

  // Debounce: one navigation per pause in typing, not one per keystroke.
  useEffect(() => {
    const id = setTimeout(() => {
      const current = searchParams.get("q") ?? "";
      if (term === current) return;
      const params = new URLSearchParams(searchParams.toString());
      term ? params.set("q", term) : params.delete("q");
      params.set("page", "1");
      startTransition(() => router.push(`${pathname}?${params}`, { scroll: false }));
    }, 350);
    return () => clearTimeout(id);
  }, [term, pathname, router, searchParams]);

  const setFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    value === "all" ? params.delete(key) : params.set(key, value);
    params.set("page", "1");
    startTransition(() => router.push(`${pathname}?${params}`, { scroll: false }));
  };

  const runExport = async (format: "csv" | "xlsx") => {
    if (!onExport) return;
    setExporting(true);
    try {
      const params = Object.fromEntries(searchParams.entries());
      const result = await onExport(params);
      if (!result.ok) return toast.error(result.error);

      const rows = result.data?.rows ?? [];
      if (!rows.length) return toast.info("Nothing to export with the current filters");

      format === "csv" ? downloadCsv(rows, exportFilename) : downloadExcel(rows, exportFilename);
      toast.success(`Exported ${rows.length} rows`);
    } finally {
      setExporting(false);
    }
  };

  const hasActiveFilters = filters.some((f) => searchParams.get(f.key)) || searchParams.get("q");

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9"
            aria-label="Search"
          />
          {isPending && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>

        {filters.map((filter) => (
          <Select
            key={filter.key}
            value={searchParams.get(filter.key) ?? "all"}
            onValueChange={(v) => setFilter(filter.key, v)}
          >
            <SelectTrigger className="w-full sm:w-[170px]">
              <SelectValue placeholder={filter.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All {filter.label}</SelectItem>
              {filter.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={() => startTransition(() => router.push(pathname))}>
            <X className="size-4" /> Clear
          </Button>
        )}

        {onExport && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={exporting}>
                {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => runExport("csv")}>Export as CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={() => runExport("xlsx")}>Export as Excel</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Floating bulk-action bar, Linear-style: appears only on selection. */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5"
          >
            <span className="text-sm font-medium">{selectedIds.length} selected</span>
            <div className="ml-auto flex items-center gap-2">
              {bulkEditSlot}
              {onBulkDelete && (
                <ConfirmDialog
                  title={`Delete ${selectedIds.length} item(s)?`}
                  description="This cannot be undone."
                  confirmLabel="Delete"
                  destructive
                  onConfirm={async () => {
                    const res = await onBulkDelete(selectedIds);
                    if (res.ok) {
                      toast.success(`Deleted ${selectedIds.length} item(s)`);
                      clearSelection();
                      router.refresh();
                    } else {
                      toast.error(res.error ?? "Delete failed");
                    }
                  }}
                  trigger={
                    <Button variant="destructive" size="sm">
                      <Trash2 className="size-4" /> Delete
                    </Button>
                  }
                />
              )}
              <Button variant="ghost" size="sm" onClick={clearSelection}>Cancel</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
