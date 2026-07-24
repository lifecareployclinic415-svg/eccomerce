import "server-only";
import { productRepository } from "@/features/products/repositories/product.repository";
import type { TableQuery } from "@/lib/data-table/table-search";
import type { ProductInput, ProductBulkEditInput } from "@/features/products/schemas/product.schema";

/**
 * Business rules live here, not in the action and not in the repository.
 * The action handles HTTP-ish concerns (auth, validation, revalidation);
 * the repository handles SQL. This layer decides what is *allowed*.
 */
export const productService = {
  async list(query: TableQuery) {
    const repo = await productRepository();
    return repo.list(query);
  },

  async getById(id: string) {
    const repo = await productRepository();
    return repo.getById(id);
  },

  async create(input: ProductInput) {
    const repo = await productRepository();

    if (await repo.isSlugTaken(input.slug)) {
      throw new Error("That slug is already in use");
    }

    return repo.create(toRow(input));
  },

  async update(id: string, input: Partial<ProductInput>) {
    const repo = await productRepository();

    if (input.slug && (await repo.isSlugTaken(input.slug, id))) {
      throw new Error("That slug is already in use");
    }

    return repo.update(id, toRow(input));
  },

  async bulkEdit({ ids, ...patch }: ProductBulkEditInput) {
    const repo = await productRepository();
    const values: Record<string, unknown> = {};
    if (patch.isPublished !== undefined) values.is_published = patch.isPublished;
    if (patch.isFeatured !== undefined) values.is_featured = patch.isFeatured;
    if (patch.categoryId) values.category_id = patch.categoryId;

    if (!Object.keys(values).length) return 0;
    return repo.bulkUpdate(ids, values);
  },

  async bulkRemove(ids: string[]) {
    const repo = await productRepository();
    return repo.bulkRemove(ids);
  },

  async exportRows(query: TableQuery) {
    const repo = await productRepository();
    const rows = await repo.listAllForExport(query);

    // Shape the export for humans, not for the database.
    return rows.map((r) => ({
      Name: r.name,
      Slug: r.slug,
      Brand: r.brands?.name ?? "",
      Category: r.categories?.name ?? "",
      "Base Price": r.base_price,
      "Sale Price": r.sale_price ?? "",
      Published: r.is_published ? "Yes" : "No",
      Featured: r.is_featured ? "Yes" : "No",
      Rating: r.rating_avg,
      Created: new Date(r.created_at).toISOString().slice(0, 10),
    }));
  },
};

/** Maps camelCase app input to snake_case database columns in one place. */
function toRow(input: Partial<ProductInput>) {
  const row: Record<string, unknown> = {};
  if (input.name !== undefined) row.name = input.name;
  if (input.slug !== undefined) row.slug = input.slug;
  if (input.description !== undefined) row.description = input.description || null;
  if (input.brandId !== undefined) row.brand_id = input.brandId || null;
  if (input.categoryId !== undefined) row.category_id = input.categoryId || null;
  if (input.subcategoryId !== undefined) row.subcategory_id = input.subcategoryId || null;
  if (input.basePrice !== undefined) row.base_price = input.basePrice;
  if (input.salePrice !== undefined) row.sale_price = input.salePrice ?? null;
  if (input.isPublished !== undefined) row.is_published = input.isPublished;
  if (input.isFeatured !== undefined) row.is_featured = input.isFeatured;
  return row;
}
