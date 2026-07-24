import { z } from "zod";

const slug = z
  .string()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens");

export const productSchema = z
  .object({
    name: z.string().min(2, "Name is required").max(160),
    slug,
    description: z.string().max(5000).optional().or(z.literal("")),
    brandId: z.string().uuid().optional().or(z.literal("")),
    categoryId: z.string().uuid().optional().or(z.literal("")),
    subcategoryId: z.string().uuid().optional().or(z.literal("")),
    basePrice: z.coerce.number().nonnegative("Price cannot be negative"),
    salePrice: z.coerce.number().nonnegative().optional(),
    isPublished: z.coerce.boolean().default(false),
    isFeatured: z.coerce.boolean().default(false),
  })
  .refine((v) => v.salePrice === undefined || v.salePrice <= v.basePrice, {
    message: "Sale price cannot exceed the base price",
    path: ["salePrice"],
  });

export const productUpdateSchema = productSchema.partial().extend({
  id: z.string().uuid(),
});

/** Bulk edit only exposes fields that are safe to change en masse. */
export const productBulkEditSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "Select at least one product"),
  isPublished: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  categoryId: z.string().uuid().optional(),
});

export const bulkIdsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

export type ProductInput = z.infer<typeof productSchema>;
export type ProductBulkEditInput = z.infer<typeof productBulkEditSchema>;
