// src/components/shared/breadcrumbs.tsx

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { JsonLd, breadcrumbSchema } from "@/features/seo/lib/json-ld";

export type Crumb = { name: string; href: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length < 2) return null;

  return (
    <>
      <JsonLd data={breadcrumbSchema(items)} />

      <nav aria-label="Breadcrumb" className="text-sm">
        <ol className="flex flex-wrap items-center gap-1.5 text-ink-soft">
          {items.map((item, index) => {
            const isLast = index === items.length - 1;

            return (
              <li key={item.href} className="flex items-center gap-1.5">
                {isLast ? (
                  // The current page is not a link, and aria-current tells
                  // assistive tech where the user is.
                  <span aria-current="page" className="text-ink">
                    {item.name}
                  </span>
                ) : (
                  <>
                    <Link href={item.href} className="transition-colors hover:text-ink">
                      {item.name}
                    </Link>
                    <ChevronRight className="size-3.5 opacity-50" aria-hidden />
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
