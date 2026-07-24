import "server-only";
import { createClient } from "@/lib/supabase/server";
import { BaseRepository } from "@/lib/repositories/base.repository";

export type ProductRow = {
  id: string;
  name: string;
  slug: string;
  base_price: number;
  sale_price: number | null;
  is_published: boolean;
  is_featured: boolean;
  rating_avg: number;
  created_at: string;
  brands: { name: string } | null;
  categories: { name: string } | null;
};

/**
 * A concrete repository is now just configuration plus any queries that are
 * genuinely specific to this entity. Everything generic comes from the base.
 */
export async function productRepository() {
  const db = await createClient();

  const repo = new BaseRepository<ProductRow>(db, {
    table: "products",
    searchColumns: ["name", "slug", "description"],
    sortableColumns: ["name", "base_price", "created_at", "rating_avg", "is_published"],
    select: "*, brands(name), categories(name)",
  });

  return Object.assign(repo, {
    /** Product-specific: slug uniqueness check for the create/edit form. */
    async isSlugTaken(slug: string, excludeId?: string) {
      let q = db.from("products").select("id").eq("slug", slug).limit(1);
      if (excludeId) q = q.neq("id", excludeId);
      const { data } = await q;
      return (data?.length ?? 0) > 0;
    },
  });
}
