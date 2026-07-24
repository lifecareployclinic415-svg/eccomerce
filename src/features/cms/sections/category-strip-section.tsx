import Link from "next/link";
import Image from "next/image";
import { StaggerGrid } from "@/components/shared/reveal";
import { storefrontService } from "@/features/storefront/services/storefront.service";
import { SectionShell } from "./section-shell";
import type { z } from "zod";
import type { categoryStripConfig } from "@/features/cms/schemas/cms.schemas";

export async function CategoryStripSection({
  config,
}: { config: z.infer<typeof categoryStripConfig>; index: number }) {
  const categories = await storefrontService.topCategories(config.limit);
  if (!categories.length) return null;

  return (
    <SectionShell heading={config.heading}>
      <StaggerGrid className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {categories.map((c) => (
          <Link
            key={c.id}
            href={`/shop?category=${c.slug}`}
            className="group relative aspect-3/4 overflow-hidden rounded-xl bg-surface-sunk"
          >
            {c.imageUrl && (
              <Image
                src={c.imageUrl}
                alt=""
                fill
                sizes="(max-width: 640px) 100vw, 25vw"
                className="object-cover transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105"
              />
            )}
            <div className="absolute inset-0 bg-linear-to-t from-black/55 to-transparent" />
            <span className="absolute bottom-4 left-4 text-lg font-medium text-white">{c.name}</span>
          </Link>
        ))}
      </StaggerGrid>
    </SectionShell>
  );
}
