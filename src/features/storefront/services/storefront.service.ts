import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TableQuery, Paginated } from "@/lib/data-table/table-search";
import type { ProductCardData } from "@/features/products/components/product-card";

/**
 * Read-only storefront queries.
 *
 * Uses the admin client because it reads PUBLISHED products only — the
 * filter is applied here rather than relying on RLS, so the query plan is
 * predictable and cacheable.
 */

const PRODUCT_CARD_SELECT = `
  id, name, slug, base_price, sale_price, rating_avg, category_id,
  brands ( name ),
  product_images ( url, is_primary, position )
`;

type Row = {
  id: string;
  name: string;
  slug: string;
  base_price: number;
  sale_price: number | null;
  rating_avg: number;
  brands: { name: string } | null;
  product_images: { url: string; is_primary: boolean; position: number }[] | null;
};

function toCard(row: Row): ProductCardData {
  const images = [...(row.product_images ?? [])].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.position - b.position,
  );

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    brand: row.brands?.name ?? null,
    basePrice: Number(row.base_price),
    salePrice: row.sale_price == null ? null : Number(row.sale_price),
    images: images.map((i) => i.url),
    ratingAvg: Number(row.rating_avg ?? 0),
  };
}

export const storefrontService = {
  async featured(limit = 8): Promise<ProductCardData[]> {
    const { data } = await createAdminClient()
      .from("products")
      .select(PRODUCT_CARD_SELECT)
      .eq("is_published", true)
      .eq("is_featured", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    return ((data ?? []) as unknown as Row[]).map(toCard);
  },

  async trending(limit = 8): Promise<ProductCardData[]> {
    const { data } = await createAdminClient()
      .from("products")
      .select(PRODUCT_CARD_SELECT)
      .eq("is_published", true)
      .order("rating_avg", { ascending: false })
      .order("rating_count", { ascending: false })
      .limit(limit);

    return ((data ?? []) as unknown as Row[]).map(toCard);
  },

  async newest(limit = 8): Promise<ProductCardData[]> {
    const { data } = await createAdminClient()
      .from("products")
      .select(PRODUCT_CARD_SELECT)
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    return ((data ?? []) as unknown as Row[]).map(toCard);
  },

  async byCategorySlug(slug: string, limit = 8): Promise<ProductCardData[]> {
    const db = createAdminClient();
    const { data: category } = await db
      .from("categories").select("id").eq("slug", slug).maybeSingle();
    if (!category) return [];

    const { data } = await db
      .from("products")
      .select(PRODUCT_CARD_SELECT)
      .eq("is_published", true)
      .eq("category_id", category.id)
      .limit(limit);

    return ((data ?? []) as unknown as Row[]).map(toCard);
  },

  /** Powers the shop grid. Mirrors the admin list contract. */
  async browse(query: TableQuery): Promise<Paginated<ProductCardData>> {
    const db = createAdminClient();
    const { page, perPage, q, sort, order, filters } = query;

    let builder = db
      .from("products")
      .select(PRODUCT_CARD_SELECT, { count: "exact" })
      .eq("is_published", true);

    if (q) {
      const pattern = q.replace(/[%_]/g, "\\$&");
      builder = builder.or(`name.ilike.%${pattern}%,description.ilike.%${pattern}%`);
    }

    if (filters.category && typeof filters.category === "string") {
      const { data: category } = await db
        .from("categories").select("id").eq("slug", filters.category).maybeSingle();
      if (category) builder = builder.eq("category_id", category.id);
      else return { rows: [], total: 0, page, perPage, pageCount: 1 };
    }

    if (filters.brand && typeof filters.brand === "string") {
      builder = builder.eq("brand_id", filters.brand);
    }
    if (filters.is_featured === "true") builder = builder.eq("is_featured", true);

    const sortable = ["created_at", "base_price", "rating_avg", "name"];
    const column = sortable.includes(sort) ? sort : "created_at";

    const start = (page - 1) * perPage;
    const { data, count } = await builder
      .order(column, { ascending: order === "asc" })
      .range(start, start + perPage - 1);

    const total = count ?? 0;
    return {
      rows: ((data ?? []) as unknown as Row[]).map(toCard),
      total,
      page,
      perPage,
      pageCount: Math.max(1, Math.ceil(total / perPage)),
    };
  },

  async getBySlug(slug: string) {
    const db = createAdminClient();
    const { data } = await db
      .from("products")
      .select(`
        id, name, slug, description, base_price, sale_price, is_published,
        rating_avg, rating_count, category_id,
        brands ( name, slug ),
        categories ( name, slug ),
        product_images ( url, alt, is_primary, position ),
        product_variants ( id, sku, price, attributes, is_active )
      `)
      .eq("slug", slug)
      .maybeSingle();

    if (!data) return null;

    const images = [...((data.product_images ?? []) as any[])].sort(
      (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.position - b.position,
    );

    // Availability comes from the view, never raw inventory.quantity.
    const variantIds = ((data.product_variants ?? []) as any[]).map((v) => v.id);
    const { data: stock } = await db
      .from("variant_availability")
      .select("variant_id, available")
      .in("variant_id", variantIds.length ? variantIds : ["00000000-0000-0000-0000-000000000000"]);

    const availability = new Map((stock ?? []).map((s: any) => [s.variant_id, s.available]));

    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      description: data.description,
      basePrice: Number(data.base_price),
      salePrice: data.sale_price == null ? null : Number(data.sale_price),
      isPublished: data.is_published,
      ratingAvg: Number(data.rating_avg ?? 0),
      ratingCount: Number(data.rating_count ?? 0),
      categoryId: data.category_id,
      brand: (data.brands as any) ?? null,
      category: (data.categories as any) ?? null,
      images: images.map((i) => ({ url: i.url, alt: i.alt })),
      variants: ((data.product_variants ?? []) as any[])
        .filter((v) => v.is_active)
        .map((v) => ({
          id: v.id,
          sku: v.sku,
          price: Number(v.price),
          attributes: v.attributes,
          available: availability.get(v.id) ?? 0,
        })),
    };
  },

  async related(productId: string, categoryId: string | null, limit = 4): Promise<ProductCardData[]> {
    if (!categoryId) return [];
    const { data } = await createAdminClient()
      .from("products")
      .select(PRODUCT_CARD_SELECT)
      .eq("is_published", true)
      .eq("category_id", categoryId)
      .neq("id", productId)
      .limit(limit);

    return ((data ?? []) as unknown as Row[]).map(toCard);
  },

  async topCategories(limit = 4) {
    const { data } = await createAdminClient()
      .from("categories")
      .select("id, name, slug, image_url")
      .eq("is_active", true)
      .order("sort_order")
      .limit(limit);

    return (data ?? []).map((c) => ({
      id: c.id, name: c.name, slug: c.slug, imageUrl: c.image_url,
    }));
  },

  async allCategories() {
    const { data } = await createAdminClient()
      .from("categories").select("id, name, slug").eq("is_active", true).order("sort_order");
    return data ?? [];
  },

  async allBrands() {
    const { data } = await createAdminClient()
      .from("brands").select("id, name, slug").eq("is_active", true).order("name");
    return data ?? [];
  },

  async topProductSlugs(limit = 50): Promise<string[]> {
    const { data } = await createAdminClient()
      .from("products")
      .select("slug")
      .eq("is_published", true)
      .order("rating_count", { ascending: false })
      .limit(limit);
    return (data ?? []).map((p) => p.slug);
  },
};
