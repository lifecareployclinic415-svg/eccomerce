"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** URL-driven, matching the admin table: shareable, back-button friendly. */
export function ShopPagination({ page, pageCount }: { page: number; pageCount: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (pageCount <= 1) return null;

  const go = (next: number) => {
    const params = new URLSearchParams(searchParams.toString());
    next <= 1 ? params.delete("page") : params.set("page", String(next));
    router.push(`${pathname}?${params}`, { scroll: true });
  };

  return (
    <nav aria-label="Pagination" className="mt-12 flex items-center justify-center gap-3">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => go(page - 1)}>
        <ChevronLeft className="size-4" /> Previous
      </Button>
      <span className="numeric text-sm text-ink-soft">{page} / {pageCount}</span>
      <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => go(page + 1)}>
        Next <ChevronRight className="size-4" />
      </Button>
    </nav>
  );
}
