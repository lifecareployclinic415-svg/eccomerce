import { StaggerGrid } from "@/components/shared/reveal";
import { ProductCard } from "@/features/products/components/product-card";
import { storefrontService } from "@/features/storefront/services/storefront.service";
import { SectionShell } from "./section-shell";
import type { z } from "zod";
import type { productRailConfig } from "@/features/cms/schemas/cms.schemas";

export async function ProductRailSection({
  config, index,
}: { config: z.infer<typeof productRailConfig>; index: number }) {
  const products =
    config.source === "trending" ? await storefrontService.trending(config.limit)
    : config.source === "newest" ? await storefrontService.newest(config.limit)
    : config.source === "category" && config.categorySlug
      ? await storefrontService.byCategorySlug(config.categorySlug, config.limit)
    : await storefrontService.featured(config.limit);

  // An empty rail is worse than no rail — render nothing.
  if (!products.length) return null;

  return (
    <SectionShell heading={config.heading} href={config.href || undefined} linkLabel={config.linkLabel}>
      <StaggerGrid className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
        {products.map((p, i) => (
          <ProductCard key={p.id} product={p} priority={index === 0 && i < 4} />
        ))}
      </StaggerGrid>
    </SectionShell>
  );
}
