// Google caps a single sitemap at 50,000 URLs and 50MB. generateSitemaps
// shards them automatically, served as /product/sitemap/0.xml and so on.
// Building this now costs nothing; retrofitting it once a catalogue has
// grown past the limit means silently unindexed products in the meantime.
import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/features/seo/services/seo.service";

const PAGE_SIZE = 45_000; // headroom under Google's 50k ceiling

export const revalidate = 3600;

export async function generateSitemaps() {
  const db = createAdminClient();
  const { count } = await db
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("is_published", true);

  const shards = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  return Array.from({ length: shards }, (_, id) => ({ id }));
}

export default async function sitemap({
  id,
}: {
  id: number;
}): Promise<MetadataRoute.Sitemap> {
  const db = createAdminClient();

  const { data } = await db
    .from("products")
    .select("slug, updated_at, product_images(url, is_primary)")
    .eq("is_published", true)
    .order("created_at", { ascending: true })
    .range(id * PAGE_SIZE, (id + 1) * PAGE_SIZE - 1);

  return (data ?? []).map((product) => {
    const images = (product.product_images ?? [])
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
      .map((i) => i.url)
      .slice(0, 5);

    return {
      url: `${SITE_URL}/product/${product.slug}`,
      lastModified: new Date(product.updated_at),
      // Image entries help products surface in Google Images, which is a
      // meaningful traffic source for physical goods.
      ...(images.length && { images }),
    };
  });
}

